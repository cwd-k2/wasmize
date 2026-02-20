import { local, Type, Mod, Ctrl, Op, Meta, RGBA } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/test-helpers";

// RGBA pixel processing: grayscale conversion + brightness adjustment
// Memory layout: offset 0 に RGBA ピクセルデータ (4 bytes/pixel)
// 1 page = 64KB = 16384 pixels

type Exports = {
  grayscale: (len: number) => void;
  brightness: (len: number, delta: number) => void;
};

function grayscaleWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(1);

    // grayscale: ITU-R BT.601 整数近似 gray = (77*R + 150*G + 29*B) >> 8
    yield* Mod.exportFunc("grayscale", { len: Type.i32 }, function* (len) {
      const i = yield* local(Type.i32, 0);
      const offset = yield* local(Type.i32);
      const gray = yield* local(Type.i32);

      yield* Ctrl.while(i.lt(len), function* () {
        yield* offset.set(i.mul(4));
        const px = RGBA.at(offset);

        yield* gray.set(
          Meta.weightedSum([
            { weight: 77, expr: px.r },
            { weight: 150, expr: px.g },
            { weight: 29, expr: px.b },
          ]).shr(8),
        );

        for (const ch of ["r", "g", "b"] as const) {
          yield* px[ch].set(gray);
        }

        yield* i.incrBy(1);
      });
    });

    // brightness: 各 RGB チャンネル += delta, clamp(0, 255) via Op.max/Op.min
    yield* Mod.exportFunc("brightness", { len: Type.i32, delta: Type.i32 }, function* (len, delta) {
      const i = yield* local(Type.i32, 0);
      const offset = yield* local(Type.i32);
      const ch = yield* local(Type.i32);

      yield* Ctrl.while(i.lt(len), function* () {
        yield* offset.set(i.mul(4));
        const px = RGBA.at(offset);

        for (const c of ["r", "g", "b"] as const) {
          yield* ch.set(Op.min(Op.max(px[c].add(delta), 0), 255));
          yield* px[c].set(ch);
        }

        yield* i.incrBy(1);
      });
    });
  });
}

export async function grayscale() {
  const binary = grayscaleWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    grayscale: exports.grayscale,
    brightness: exports.brightness,
    setPixels(data: Uint8Array) {
      bytes!.set(data);
    },
    getPixels(n: number): Uint8Array {
      return bytes!.slice(0, n * 4);
    },
    binary,
  };
}
