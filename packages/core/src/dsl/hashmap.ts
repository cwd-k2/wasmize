import type { WasmRef, FuncGen, FuncInstruction } from "./types";
import { type ExprInput, ChainableExpr, set, resolve } from "./expr";
import { IR } from "../wasm/ir";
import { val } from "./types";
import { Mem, Ctrl, Loc } from "./namespaces";
import { local, Type } from "./declarations";

// Status constants
const EMPTY = 0;
const OCCUPIED = 1;
const DELETED = 2;

// Hash constant: golden ratio * 2^32 as signed i32
const HASH_PRIME = -1640531535; // 0x9E3779B1

export interface HashMapHandle {
  /** Sets a key-value pair. Overwrites if key already exists. */
  set(key: ExprInput, value: ExprInput): FuncGen<void>;
  /** Loads the value for the given key into `dst`. Undefined behavior if key is absent. */
  get(key: ExprInput, dst: WasmRef<"i32">): FuncGen<void>;
  /** Returns 1 if the key exists, 0 otherwise. */
  has(key: ExprInput): FuncGen<import("./types").WasmVal>;
  /** Deletes a key. No-op if absent. */
  delete(key: ExprInput): FuncGen<void>;
  /** Clears all entries, resetting count and all status slots. */
  clear(): FuncGen<void>;
  /** True while the map has entries. */
  readonly notEmpty: ChainableExpr;
}

/**
 * Creates an open-addressing hash map with linear probing, backed by linear memory.
 *
 * **Capacity must be a power of 2** (compile-time assertion).
 *
 * Memory layout (3 parallel arrays):
 * - statuses: `base` (i32 × capacity, 0=empty / 1=occupied / 2=deleted)
 * - keys:     `base + capacity×4`
 * - values:   `base + capacity×8`
 *
 * @param base - Base byte offset
 * @param capacity - Number of slots (must be power of 2)
 */
export function* HashMap(
  base: ExprInput,
  capacity: number,
): Generator<any, HashMapHandle, any> {
  // Compile-time assertion: capacity must be power of 2
  if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
    throw new Error(`HashMap capacity must be a power of 2, got ${capacity}`);
  }

  const mask = capacity - 1;
  const count: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const probe: WasmRef<"i32"> = yield* local(Type.i32);
  const probeStatus: WasmRef<"i32"> = yield* local(Type.i32);
  const result: WasmRef<"i32"> = yield* local(Type.i32);

  // Memory regions: statuses | keys | values (each i32 × capacity)
  const statuses = Mem.i32Array(base);
  // Keys start at base + capacity * 4 bytes
  const keysBase =
    typeof base === "number" ? base + capacity * 4 : new ChainableExpr(resolve(base)).add(capacity * 4);
  const keys = Mem.i32Array(keysBase);
  // Values start at base + capacity * 8 bytes
  const valsBase =
    typeof base === "number" ? base + capacity * 8 : new ChainableExpr(resolve(base)).add(capacity * 8);
  const vals = Mem.i32Array(valsBase);

  /** Computes hash index: (key * PRIME) & mask */
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

  /**
   * Linear probe: finds the slot for `key`.
   * Sets `probe` to the slot index and `result` to:
   *   1 if key was found (OCCUPIED with matching key)
   *   0 if an empty/deleted slot was reached (key absent)
   *
   * On insert, caller should check result: if 0, `probe` points to the first
   * empty or deleted slot encountered.
   */
  function findSlot(key: ExprInput): FuncGen<void> {
    return (function* () {
      yield* set(probe, hash(key));
      yield* set(result, 0);

      // Track first deleted slot for insert optimization
      const firstDeleted: WasmRef<"i32"> = yield* local(Type.i32, -1);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* set(probeStatus, statuses.load(probe));

          // Empty slot: key not found
          yield* Ctrl.when(probeStatus.eq(EMPTY), function* () {
            // If we saw a deleted slot, prefer it for insertion
            yield* Ctrl.when(firstDeleted.ge(0), () => [set(probe, firstDeleted)]);
            yield* Ctrl.br(2);
          });

          // Deleted slot: remember it but keep probing
          yield* Ctrl.when(probeStatus.eq(DELETED), function* () {
            yield* Ctrl.when(firstDeleted.lt(0), () => [set(firstDeleted, probe)]);
          });

          // Occupied: check key match
          yield* Ctrl.when(probeStatus.eq(OCCUPIED).and(keys.load(probe).eq(key)), function* () {
            yield* set(result, 1);
            yield* Ctrl.br(2);
          });

          // Advance probe
          yield* set(probe, probe.add(1).and(mask));
          yield* Ctrl.br(0);
        });
      });
    })();
  }

  return {
    set(key: ExprInput, value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* findSlot(key);
        // If key not found, increment count and mark occupied
        yield* Ctrl.when(result.eq(0), function* () {
          yield* count.incrBy(1);
          yield* statuses.store(probe, OCCUPIED);
        });
        yield* keys.store(probe, key);
        yield* vals.store(probe, value);
      })();
    },

    get(key: ExprInput, dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* findSlot(key);
        yield* Ctrl.when(result.eq(1), () => [set(dst, vals.load(probe))]);
      })();
    },

    has(key: ExprInput): FuncGen<import("./types").WasmVal> {
      return (function* () {
        yield* findSlot(key);
        return yield* Loc.get(result);
      })();
    },

    delete(key: ExprInput): FuncGen<void> {
      return (function* () {
        yield* findSlot(key);
        yield* Ctrl.when(result.eq(1), function* () {
          yield* statuses.store(probe, DELETED);
          yield* count.decrBy(1);
        });
      })();
    },

    clear(): FuncGen<void> {
      return (function* () {
        const i: WasmRef<"i32"> = yield* local(Type.i32);
        yield* Ctrl.range(i, capacity, () => [statuses.store(i, EMPTY)]);
        yield* set(count, 0);
      })();
    },

    get notEmpty(): ChainableExpr {
      return count.gt(0);
    },
  };
}
