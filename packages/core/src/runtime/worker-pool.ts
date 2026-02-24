// @ts-expect-error -- node:worker_threads has no type declarations in this project
import { Worker } from "node:worker_threads";
import type { WasmBinary } from "../dsl/types";

interface WorkerTask {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

/** Encapsulates a Worker and its associated state (pending tasks, id counter). */
interface WorkerState {
  worker: Worker;
  pending: Map<number, WorkerTask>;
  nextId: number;
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
  private states: WorkerState[] = [];
  private idle: WorkerState[] = [];
  private queue: Array<{ name: string; args: any[]; task: WorkerTask }> = [];
  private inflight: Map<string, Promise<any>> | null;

  constructor(binary: WasmBinary<T>, options: { workers: number; dedup?: boolean }) {
    this.inflight = options.dedup ? new Map() : null;
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

      const state: WorkerState = {
        worker,
        pending: new Map(),
        nextId: 0,
      };

      worker.on("message", (msg: any) => {
        if (msg.type === "ready") {
          this.idle.push(state);
          this.dispatch();
        } else if (msg.type === "result") {
          const task = state.pending.get(msg.id);
          if (task) {
            state.pending.delete(msg.id);
            task.resolve(msg.result);
            this.idle.push(state);
            this.dispatch();
          }
        } else if (msg.type === "error") {
          const task = state.pending.get(msg.id);
          if (task) {
            state.pending.delete(msg.id);
            task.reject(new Error(msg.error));
            this.idle.push(state);
            this.dispatch();
          }
        }
      });

      this.states.push(state);
    }
  }

  /**
   * Runs a Wasm export on an available worker.
   * Queues the task if all workers are busy.
   *
   * When `dedup: true`, identical calls (same name + args) that are already
   * in-flight will return the existing Promise instead of dispatching again.
   */
  run<K extends string & keyof T>(name: K, ...args: any[]): Promise<any> {
    if (this.inflight) {
      const key = `${name}:${JSON.stringify(args)}`;
      const existing = this.inflight.get(key);
      if (existing) return existing;

      const promise = this.enqueue(name, args).finally(() => {
        this.inflight!.delete(key);
      });
      this.inflight.set(key, promise);
      return promise;
    }

    return this.enqueue(name, args);
  }

  private enqueue(name: string, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ name, args, task: { resolve, reject } });
      this.dispatch();
    });
  }

  private dispatch() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const state = this.idle.pop()!;
      const { name, args, task } = this.queue.shift()!;
      const id = state.nextId++;
      state.pending.set(id, task);
      state.worker.postMessage({ type: "run", name, args, id });
    }
  }

  /** Terminates all workers. */
  terminate(): void {
    for (const { worker } of this.states) {
      worker.terminate();
    }
    this.states = [];
    this.idle = [];
  }
}
