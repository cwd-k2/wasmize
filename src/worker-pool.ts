// @ts-expect-error -- node:worker_threads has no type declarations in this project
import { Worker } from "node:worker_threads";
import type { WasmBinary } from "./dsl/types";

interface WorkerTask {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

/**
 * WorkerPool runs Wasm functions in parallel using Node.js worker_threads.
 *
 * Each worker instantiates the Wasm binary independently and
 * processes tasks from a shared queue.
 *
 * @example
 * ```ts
 * const pool = new WorkerPool(binary, { workers: 4 });
 * const results = await Promise.all([
 *   pool.run("compute", 1),
 *   pool.run("compute", 2),
 * ]);
 * pool.terminate();
 * ```
 */
export class WorkerPool<T = Record<string, unknown>> {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{ name: string; args: any[]; task: WorkerTask }> = [];

  constructor(
    binary: WasmBinary<T>,
    options: { workers: number },
  ) {
    const wasmBytes = Array.from(binary);

    for (let i = 0; i < options.workers; i++) {
      const worker = new Worker(
        `
        const { parentPort, workerData } = require('worker_threads');
        const bytes = new Uint8Array(workerData.wasmBytes);
        let instance = null;

        async function init() {
          const { instance: inst } = await WebAssembly.instantiate(bytes);
          instance = inst;
          parentPort.postMessage({ type: 'ready' });
        }

        parentPort.on('message', async (msg) => {
          if (msg.type === 'run') {
            try {
              const fn = instance.exports[msg.name];
              const result = fn(...msg.args);
              parentPort.postMessage({ type: 'result', result, id: msg.id });
            } catch (err) {
              parentPort.postMessage({ type: 'error', error: err.message, id: msg.id });
            }
          }
        });

        init();
        `,
        {
          eval: true,
          workerData: { wasmBytes },
        },
      );

      const pending = new Map<number, WorkerTask>();
      let taskId = 0;

      worker.on("message", (msg: any) => {
        if (msg.type === "ready") {
          this.idle.push(worker);
          this.dispatch();
        } else if (msg.type === "result") {
          const task = pending.get(msg.id);
          if (task) {
            pending.delete(msg.id);
            task.resolve(msg.result);
            this.idle.push(worker);
            this.dispatch();
          }
        } else if (msg.type === "error") {
          const task = pending.get(msg.id);
          if (task) {
            pending.delete(msg.id);
            task.reject(new Error(msg.error));
            this.idle.push(worker);
            this.dispatch();
          }
        }
      });

      // Attach pending map and id counter to worker
      (worker as any).__pending = pending;
      (worker as any).__nextId = () => taskId++;

      this.workers.push(worker);
    }
  }

  /**
   * Runs a Wasm export on an available worker.
   * Queues the task if all workers are busy.
   */
  async run<K extends string & keyof T>(
    name: K,
    ...args: any[]
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ name, args, task: { resolve, reject } });
      this.dispatch();
    });
  }

  private dispatch() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const { name, args, task } = this.queue.shift()!;
      const pending = (worker as any).__pending as Map<number, WorkerTask>;
      const id = (worker as any).__nextId() as number;
      pending.set(id, task);
      worker.postMessage({ type: "run", name, args, id });
    }
  }

  /** Terminates all workers. */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idle = [];
  }
}
