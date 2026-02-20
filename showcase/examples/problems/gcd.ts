/**
 * P6: GCD Array — greatest common divisor of an array.
 *
 * Approach: Iterative Euclidean algorithm applied across all elements.
 * Memory layout: i32 array at offset 0.
 * Complexity: O(n * log(max)) time.
 * DSL features: Ctrl.while, Ctrl.range, Mem.i32Array.
 */
import { locals, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem6_gcd_array() {
  return compileWithWat<{ array_gcd: (len: number) => number }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // array_gcd(len) — GCD loop inlined to avoid per-element function call overhead
    yield* Mod.exportFunc("array_gcd", { len: Type.i32 }, function* (len) {
      const [result, i, a, b, t] = yield* locals(Type.i32, Type.i32, Type.i32, Type.i32, Type.i32);

      yield* result.set(arr.load(0));

      yield* Ctrl.for(i, 1, i.lt(len), i.add(1), function* () {
        yield* a.set(result);
        yield* b.set(arr.load(i));
        yield* Ctrl.while(b.ne(0), () => [t.set(b), b.set(a.rem(b)), a.set(t)]);
        yield* result.set(a);
      });

      return result;
    });
  });
}
