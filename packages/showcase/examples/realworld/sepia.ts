import { locals, Type, Mod, Ctrl, Meta, RGBA } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";
import { instantiate } from "wasmize/runtime/instantiate";

// Sepia tone color matrix transformation
// Memory layout: offset 0 = RGBA pixels (4 bytes/pixel, in-place)
//
// Sepia matrix (fixed-point ×256):
//   newR = (0.393*R + 0.769*G + 0.189*B) → (101*R + 197*G + 48*B) >> 8
//   newG = (0.349*R + 0.686*G + 0.168*B) → ( 89*R + 176*G + 43*B) >> 8
//   newB = (0.272*R + 0.534*G + 0.131*B) → ( 70*R + 137*G + 34*B) >> 8
//
// Meta patterns used:
// - Meta.each: iterate over output channels
// - Meta.weightedSum: matrix row × RGB vector (fixed-point)

type Exports = {
  sepia: (len: number) => void;
};

// Sepia matrix scaled by 256 for fixed-point integer arithmetic
const SEPIA_MATRIX = [
  [101, 197, 48], // R coefficients
  [89, 176, 43], // G coefficients
  [70, 137, 34], // B coefficients
];

function sepiaWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(1);

    yield* Mod.exportFunc("sepia", { len: Type.i32 }, function* (len) {
      // Save input RGB to avoid write-after-read hazard (in-place transform)
      const [i, offset, r, g, b, ch] =
        yield* locals([Type.i32, 0], Type.i32, Type.i32, Type.i32, Type.i32, Type.i32);

      yield* Ctrl.while(i.lt(len), function* () {
        yield* offset.set(i.mul(4));
        const px = RGBA.at(offset);

        // Read input RGB before overwriting
        yield* r.set(px.r);
        yield* g.set(px.g);
        yield* b.set(px.b);

        // Apply sepia matrix: each output channel is a weighted sum of input RGB
        const rgb = [r, g, b];
        yield* Meta.each([0, 1, 2], (outCh) => [
          ch.set(
            Meta.weightedSum(
              SEPIA_MATRIX[outCh]!.map((w, inCh) => ({
                weight: w,
                expr: rgb[inCh]!,
              })),
            )
              .shr(8)
              .clamp(0, 255),
          ),
          px[["r", "g", "b"][outCh] as "r" | "g" | "b"].set(ch),
        ]);

        yield* i.incrBy(1);
      });
    });
  });
}

export async function sepia() {
  const binary = sepiaWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    sepia: exports.sepia,
    setPixels(data: Uint8Array) {
      bytes!.set(data);
    },
    getPixels(n: number): Uint8Array {
      return bytes!.slice(0, n * 4);
    },
    binary,
  };
}
