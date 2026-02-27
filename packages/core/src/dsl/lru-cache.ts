/**
 * LRU Cache (Least Recently Used) backed by linear memory.
 *
 * Generator factory pattern: `const cache = yield* LRUCache(base, capacity)`
 * allocates internal locals and returns a handle with `get`/`put`/`clear`.
 *
 * Uses open addressing with linear probing for O(1) amortized lookup.
 * Capacity must be a power of 2.
 *
 * Memory layout (4 parallel arrays, each capacity i32 words):
 * - statuses:   base + 0 * capacity * 4     (0=empty, 1=occupied)
 * - keys:       base + 1 * capacity * 4
 * - values:     base + 2 * capacity * 4
 * - timestamps: base + 3 * capacity * 4     (access counter for LRU ordering)
 *
 * LRU eviction: on put when full, scan for the entry with the minimum timestamp.
 *
 * @param base - Base byte offset
 * @param capacity - Number of slots (must be power of 2)
 *
 * @module
 */
import type { WasmRef, FuncGen, FuncInstruction } from "./types";
import { type ExprInput, ChainableExpr, set, resolve } from "./expr";
import { IR } from "../wasm/ir";
import { val } from "./types";
import { Mem, Ctrl, Loc } from "./namespaces";
import { local, Type } from "./declarations";

// Status constants
const EMPTY = 0;
const OCCUPIED = 1;

// Hash constant
const HASH_PRIME = -1640531535; // 0x9E3779B1

export interface LRUCacheHandle {
  /** Looks up key. Returns 1 if found (value written to dst), 0 if miss. */
  get(key: ExprInput, dst: WasmRef<"i32">): FuncGen<import("./types").WasmVal>;
  /** Inserts or updates key-value pair. Evicts LRU entry when full. */
  put(key: ExprInput, val: ExprInput): FuncGen<void>;
  /** Clears all entries. */
  clear(): FuncGen<void>;
}

/**
 * Creates an LRU cache backed by linear memory.
 *
 * @param base - Base byte offset
 * @param capacity - Number of slots (must be power of 2)
 */
export function* LRUCache(
  base: ExprInput,
  capacity: number,
): Generator<any, LRUCacheHandle, any> {
  // Compile-time assertion
  if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
    throw new Error(`LRUCache capacity must be a power of 2, got ${capacity}`);
  }

  const mask = capacity - 1;
  const count: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const clock: WasmRef<"i32"> = yield* local(Type.i32, 0); // monotonic access counter
  const probe: WasmRef<"i32"> = yield* local(Type.i32);
  const result: WasmRef<"i32"> = yield* local(Type.i32);
  const probeStatus: WasmRef<"i32"> = yield* local(Type.i32);
  const probeCount: WasmRef<"i32"> = yield* local(Type.i32); // tracks iterations in findSlot
  const minTs: WasmRef<"i32"> = yield* local(Type.i32);
  const minIdx: WasmRef<"i32"> = yield* local(Type.i32);
  const scanI: WasmRef<"i32"> = yield* local(Type.i32);

  // Memory regions
  const statuses = Mem.i32Array(base);
  const keysBase =
    typeof base === "number" ? base + capacity * 4 : new ChainableExpr(resolve(base)).add(capacity * 4);
  const keys = Mem.i32Array(keysBase);
  const valsBase =
    typeof base === "number" ? base + capacity * 8 : new ChainableExpr(resolve(base)).add(capacity * 8);
  const vals = Mem.i32Array(valsBase);
  const tsBase =
    typeof base === "number" ? base + capacity * 12 : new ChainableExpr(resolve(base)).add(capacity * 12);
  const timestamps = Mem.i32Array(tsBase);

  /** Hash function: (key * PRIME) & mask */
  function hash(key: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* (): Generator<FuncInstruction, import("./types").WasmVal, any> {
        const vk = yield* resolve(key);
        return val(
          IR.binop("and", IR.binop("mul", vk._node, IR.const_i32(HASH_PRIME)), IR.const_i32(mask)),
        );
      })(),
    );
  }

  /** Find slot for key. Sets probe to slot index, result to 1 (found) or 0 (not found). */
  function findSlot(key: ExprInput): FuncGen<void> {
    return (function* () {
      yield* set(probe, hash(key));
      yield* set(result, 0);
      yield* set(probeCount, 0);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          // Guard: stop after capacity probes (table full, key not found)
          yield* Ctrl.when(probeCount.ge(capacity), function* () {
            yield* Ctrl.br(2);
          });
          yield* probeCount.incrBy(1);

          yield* set(probeStatus, statuses.load(probe));

          // Empty slot: not found
          yield* Ctrl.when(probeStatus.eq(EMPTY), function* () {
            yield* Ctrl.br(2);
          });

          // Occupied with matching key: found
          yield* Ctrl.when(probeStatus.eq(OCCUPIED).and(keys.load(probe).eq(key)), function* () {
            yield* set(result, 1);
            yield* Ctrl.br(2);
          });

          // Advance
          yield* set(probe, probe.add(1).and(mask));
          yield* Ctrl.br(0);
        });
      });
    })();
  }

  /** Find the LRU slot (minimum timestamp among occupied entries). */
  function findLRU(): FuncGen<void> {
    return (function* () {
      yield* set(minTs, 0x7FFFFFFF);
      yield* set(minIdx, 0);

      yield* Ctrl.range(scanI, capacity, function* () {
        yield* Ctrl.when(
          statuses.load(scanI).eq(OCCUPIED).and(timestamps.load(scanI).lt(minTs)),
          () => [
            minTs.set(timestamps.load(scanI)),
            minIdx.set(scanI),
          ],
        );
      });
      // Set probe to the LRU slot
      yield* set(probe, minIdx);
    })();
  }

  return {
    get(key: ExprInput, dst: WasmRef<"i32">): FuncGen<import("./types").WasmVal> {
      return (function* () {
        yield* findSlot(key);
        yield* Ctrl.when(result.eq(1), function* () {
          yield* set(dst, vals.load(probe));
          // Update timestamp
          yield* clock.incrBy(1);
          yield* timestamps.store(probe, clock);
        });
        return yield* Loc.get(result);
      })();
    },

    put(key: ExprInput, val_: ExprInput): FuncGen<void> {
      return (function* () {
        yield* findSlot(key);
        yield* clock.incrBy(1);

        yield* Ctrl.if(result.eq(1))
          .then(function* () {
            // Key exists: update value and timestamp
            yield* vals.store(probe, val_);
            yield* timestamps.store(probe, clock);
          })
          .else(function* () {
            // Key not found: need to insert
            yield* Ctrl.when(count.ge(capacity), function* () {
              // Cache is full: evict LRU
              yield* findLRU();
              // probe now points to LRU slot — overwrite it
              yield* count.decrBy(1);
            });
            // Insert at probe (either empty slot from findSlot or LRU eviction slot)
            yield* statuses.store(probe, OCCUPIED);
            yield* keys.store(probe, key);
            yield* vals.store(probe, val_);
            yield* timestamps.store(probe, clock);
            yield* count.incrBy(1);
          });
      })();
    },

    clear(): FuncGen<void> {
      return (function* () {
        yield* Ctrl.range(scanI, capacity, () => [
          statuses.store(scanI, EMPTY),
        ]);
        yield* set(count, 0);
        yield* set(clock, 0);
      })();
    },
  };
}
