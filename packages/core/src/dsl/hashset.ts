import type { WasmRef, FuncGen } from "./types";
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

export interface HashSetHandle {
  /** Adds a key to the set. No-op if already present. */
  add(key: ExprInput): FuncGen<void>;
  /** Returns 1 if the key exists, 0 otherwise. */
  has(key: ExprInput): FuncGen<import("./types").WasmVal>;
  /** Deletes a key. No-op if absent. */
  delete(key: ExprInput): FuncGen<void>;
  /** Clears all entries, resetting count and all status slots. */
  clear(): FuncGen<void>;
  /** True while the set has entries. */
  readonly notEmpty: ChainableExpr;
}

/**
 * Creates an open-addressing hash set with linear probing, backed by linear memory.
 *
 * **Capacity must be a power of 2** (compile-time assertion).
 *
 * Memory layout (2 parallel arrays):
 * - statuses: `base` (i32 x capacity, 0=empty / 1=occupied / 2=deleted)
 * - keys:     `base + capacity*4`
 *
 * @param base - Base byte offset
 * @param capacity - Number of slots (must be power of 2)
 */
export function* HashSet(
  base: ExprInput,
  capacity: number,
): Generator<any, HashSetHandle, any> {
  if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
    throw new Error(`HashSet capacity must be a power of 2, got ${capacity}`);
  }

  const mask = capacity - 1;
  const count: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const probe: WasmRef<"i32"> = yield* local(Type.i32);
  const probeStatus: WasmRef<"i32"> = yield* local(Type.i32);
  const result: WasmRef<"i32"> = yield* local(Type.i32);

  // Memory regions: statuses | keys (each i32 x capacity)
  const statuses = Mem.i32Array(base);
  const keysBase =
    typeof base === "number" ? base + capacity * 4 : new ChainableExpr(resolve(base)).add(capacity * 4);
  const keys = Mem.i32Array(keysBase);

  /** Computes hash index: (key * PRIME) & mask */
  function hash(key: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* (): Generator<import("./types").FuncInstruction, import("./types").WasmVal, any> {
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
   */
  function findSlot(key: ExprInput): FuncGen<void> {
    return (function* () {
      yield* set(probe, hash(key));
      yield* set(result, 0);

      const firstDeleted: WasmRef<"i32"> = yield* local(Type.i32, -1);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* set(probeStatus, statuses.load(probe));

          // Empty slot: key not found
          yield* Ctrl.when(probeStatus.eq(EMPTY), function* () {
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
    add(key: ExprInput): FuncGen<void> {
      return (function* () {
        yield* findSlot(key);
        // If key not found, add it
        yield* Ctrl.when(result.eq(0), function* () {
          yield* count.incrBy(1);
          yield* statuses.store(probe, OCCUPIED);
          yield* keys.store(probe, key);
        });
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
