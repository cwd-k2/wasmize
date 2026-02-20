/**
 * P7: Sieve of Eratosthenes — count primes up to n.
 *
 * Approach: Classic sieve marking composites in a byte array.
 * Memory layout: byte array at offset 0, one byte per number (0=prime, 1=composite).
 * Complexity: O(n log log n) time, O(n) space.
 * DSL features: Mem.store8/load8, nested Ctrl.for.
 */
import { locals, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem7_sieve() {
  return compileWithWat<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("sieve", { n: Type.i32 }, function* (n) {
      const [i, j, count] = yield* locals(Type.i32, Type.i32, [Type.i32, 0]);

      // Bulk init: write 0x01010101 in i32 chunks (4x fewer iterations)
      yield* Ctrl.for(i, 0, i.le(n.div(4)), i.add(1), () => [Mem.store(i.mul(4), 0x01010101)]);
      yield* Mem.store8(0, 0);
      yield* Mem.store8(1, 0);

      // Sieve: for p from 2 while p*p <= n
      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          Ctrl.for(j, i.mul(i), j.le(n), j.add(i), () => [Mem.store8(j, 0)]),
        ]),
      ]);

      // Count primes
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [count.incrBy(1)]),
      ]);

      return count;
    });
  });
}
