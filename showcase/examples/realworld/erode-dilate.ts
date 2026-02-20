import { local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/runtime/instantiate";

// Binary morphology: erode and dilate on byte grids (0/1 values)
// Memory layout: input at offset 0 (w*h bytes), output at offset w*h
//
// Erode: output[y][x] = 1 iff all 3x3 neighbors (including center) are 1
// Dilate: output[y][x] = 1 iff any 3x3 neighbor (including center) is 1
//
// Border pixels are left as 0 (erode) or copied from center (dilate).

type Exports = {
  erode: (w: number, h: number) => void;
  dilate: (w: number, h: number) => void;
};

// 3x3 kernel offsets including center
const KERNEL_3X3 = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
];

function erodeDilateWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(4);

    // Erode: all 9 cells in 3x3 must be 1
    yield* Mod.exportFunc("erode", { w: Type.i32, h: Type.i32 }, function* (w, h) {
      const x = yield* local(Type.i32);
      const y = yield* local(Type.i32);
      const allOnes = yield* local(Type.i32);
      const gridSize = yield* local(Type.i32);

      yield* gridSize.set(w.mul(h));
      const src = Mem.byteGrid(0, w);
      const dst = Mem.byteGrid(gridSize, w);

      // Clear output
      yield* Ctrl.range(x, gridSize, () => [Mem.store8(x.add(gridSize), 0)]);

      // Process interior (skip 1-pixel border)
      yield* Ctrl.range(y, 1, h.sub(1), function* () {
        yield* Ctrl.range(x, 1, w.sub(1), function* () {
          yield* allOnes.set(1);

          for (const { dx, dy } of KERNEL_3X3) {
            yield* allOnes.andBy(src.load(y.add(dy), x.add(dx)));
          }

          yield* dst.store(y, x, allOnes);
        });
      });
    });

    // Dilate: any of 9 cells in 3x3 is 1
    yield* Mod.exportFunc("dilate", { w: Type.i32, h: Type.i32 }, function* (w, h) {
      const x = yield* local(Type.i32);
      const y = yield* local(Type.i32);
      const anyOne = yield* local(Type.i32);
      const gridSize = yield* local(Type.i32);

      yield* gridSize.set(w.mul(h));
      const src = Mem.byteGrid(0, w);
      const dst = Mem.byteGrid(gridSize, w);

      // Clear output
      yield* Ctrl.range(x, gridSize, () => [Mem.store8(x.add(gridSize), 0)]);

      // Process interior (skip 1-pixel border)
      yield* Ctrl.range(y, 1, h.sub(1), function* () {
        yield* Ctrl.range(x, 1, w.sub(1), function* () {
          yield* anyOne.set(0);

          for (const { dx, dy } of KERNEL_3X3) {
            yield* anyOne.orBy(src.load(y.add(dy), x.add(dx)));
          }

          yield* dst.store(y, x, anyOne);
        });
      });
    });
  });
}

export async function erodeDilate() {
  const binary = erodeDilateWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    erode: exports.erode,
    dilate: exports.dilate,
    setGrid(data: number[]) {
      for (let i = 0; i < data.length; i++) {
        bytes![i] = data[i];
      }
    },
    getOutput(w: number, h: number): number[] {
      const offset = w * h;
      const result: number[] = [];
      for (let i = 0; i < w * h; i++) {
        result.push(bytes![offset + i]);
      }
      return result;
    },
    binary,
  };
}
