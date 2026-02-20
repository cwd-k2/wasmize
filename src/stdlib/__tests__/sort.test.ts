import { describe, test, expect } from "vitest";
import { compile } from "../../dsl/compiler";
import { Type, Mod, Mem } from "../../dsl/primitives";
import { instantiate } from "../../runtime/instantiate";
import { sortI32 } from "../sort";
import { sortWith } from "../sort";

describe("stdlib/sort", () => {
  test("sortI32 sorts i32 array in ascending order", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(sortI32);

      yield* Mod.exportFunc("sort", { lo: Type.i32, hi: Type.i32 }, function* (lo, hi) {
        yield* sort.void(lo, hi);
      });

      yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array().load(idx);
      });

      yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
        yield* Mem.i32Array().store(idx, val);
      });
    });

    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    // Write test data: [5, 3, 8, 1, 9, 2]
    const data = [5, 3, 8, 1, 9, 2];
    data.forEach((v, i) => write(i, v));

    sort(0, data.length - 1);

    const result = Array.from({ length: data.length }, (_, i) => read(i));
    expect(result).toEqual([1, 2, 3, 5, 8, 9]);
  });

  test("sortI32 handles already sorted array", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(sortI32);
      yield* Mod.exportFunc("sort", { lo: Type.i32, hi: Type.i32 }, function* (lo, hi) {
        yield* sort.void(lo, hi);
      });
      yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array().load(idx);
      });
      yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
        yield* Mem.i32Array().store(idx, val);
      });
    });

    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    [1, 2, 3, 4, 5].forEach((v, i) => write(i, v));
    sort(0, 4);
    expect(Array.from({ length: 5 }, (_, i) => read(i))).toEqual([1, 2, 3, 4, 5]);
  });

  test("sortWith uses custom comparator for descending order", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      // Ascending comparator: a - b
      const ascCmp = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.sub(b);
      });

      // Descending comparator: b - a
      const descCmp = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* b.sub(a);
      });

      const sortFn = yield* sortWith([ascCmp, descCmp]);

      yield* Mod.exportFunc(
        "sort",
        { lo: Type.i32, hi: Type.i32, cmpIdx: Type.i32 },
        function* (lo, hi, cmpIdx) {
          yield* sortFn.void(lo, hi, cmpIdx);
        },
      );

      yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array().load(idx);
      });

      yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
        yield* Mem.i32Array().store(idx, val);
      });
    });

    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    const data = [5, 3, 8, 1, 9, 2];
    data.forEach((v, i) => write(i, v));

    // Sort ascending (cmpIdx = 0)
    sort(0, data.length - 1, 0);
    expect(Array.from({ length: data.length }, (_, i) => read(i))).toEqual([1, 2, 3, 5, 8, 9]);

    // Re-write and sort descending (cmpIdx = 1)
    data.forEach((v, i) => write(i, v));
    sort(0, data.length - 1, 1);
    expect(Array.from({ length: data.length }, (_, i) => read(i))).toEqual([9, 8, 5, 3, 2, 1]);
  });
});
