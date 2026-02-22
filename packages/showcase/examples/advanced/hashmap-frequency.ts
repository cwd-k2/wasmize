/**
 * HashMap Frequency — 出現頻度カウント + 最頻値検索
 *
 * HashMap を用いて配列中の値の出現回数をカウントし、最頻値を検索する。
 *
 * DSL features: HashMap, Ctrl.range
 */
import { locals, local, Type, Mod, Mem, Ctrl, HashMap } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";
import { instantiate } from "wasmize/runtime/instantiate";

// Memory layout:
//   offset 0:    input array (n × i32)
//   offset 4096: HashMap backing (capacity=256, uses 3 × 256 × 4 = 3072 bytes)
const INPUT_BASE = 0;
const MAP_BASE = 4096;
const MAP_CAPACITY = 256;

type Exports = {
  countFrequencies: (n: number) => void;
  getFrequency: (key: number) => number;
  findMode: (n: number) => number;
};

function hashFrequencyWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(2);

    const input = Mem.i32Array(INPUT_BASE);

    // countFrequencies: count occurrences of each value using HashMap
    yield* Mod.exportFunc("countFrequencies", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);
      const key = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);
      const map = yield* HashMap(MAP_BASE, MAP_CAPACITY);

      yield* map.clear();

      yield* Ctrl.range(i, n, () => [
        key.set(input.load(i)),
        Ctrl.if(map.has(key))
          .then(() => [map.get(key, tmp), map.set(key, tmp.add(1))])
          .else(() => [map.set(key, 1)]),
      ]);
    });

    // getFrequency: return the count for a given key
    yield* Mod.exportFunc("getFrequency", { key: Type.i32 }, function* (key) {
      const tmp = yield* local(Type.i32, 0);
      const map = yield* HashMap(MAP_BASE, MAP_CAPACITY);

      yield* Ctrl.if(map.has(key))
        .then(() => [map.get(key, tmp)])
        .else(() => [tmp.set(0)]);

      return tmp;
    });

    // findMode: find the most frequent value in the input array
    yield* Mod.exportFunc("findMode", { n: Type.i32 }, function* (n) {
      const [i, key, tmp, bestVal, bestCount] =
        yield* locals(Type.i32, Type.i32, Type.i32, [Type.i32, 0], [Type.i32, 0]);
      const map = yield* HashMap(MAP_BASE, MAP_CAPACITY);

      // Build frequency map
      yield* map.clear();
      yield* Ctrl.range(i, n, () => [
        key.set(input.load(i)),
        Ctrl.if(map.has(key))
          .then(() => [map.get(key, tmp), map.set(key, tmp.add(1))])
          .else(() => [map.set(key, 1)]),
      ]);

      // Scan input to find max frequency
      yield* Ctrl.range(i, n, () => [
        key.set(input.load(i)),
        map.get(key, tmp),
        Ctrl.when(tmp.gt(bestCount), () => [
          bestCount.set(tmp),
          bestVal.set(key),
        ]),
      ]);

      return bestVal;
    });
  });
}

export async function hashmapFrequency() {
  const binary = hashFrequencyWasm();
  const { exports, mem } = await instantiate(binary);

  return {
    /** Write an i32 array at the input region. */
    setArray(arr: number[]) {
      for (let i = 0; i < arr.length; i++) {
        mem![i] = arr[i];
      }
    },
    countFrequencies: exports.countFrequencies,
    getFrequency: exports.getFrequency,
    findMode: exports.findMode,
    binary,
  };
}
