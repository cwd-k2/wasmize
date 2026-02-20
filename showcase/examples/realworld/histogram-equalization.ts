import { locals, Type, Mod, Mem, Ctrl, Op, Meta, RGBA } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/runtime/instantiate";

// Histogram equalization for RGBA images
// Adjusts contrast by flattening the luminance histogram.
//
// Memory layout:
//   offset 0          = RGBA pixels (4 bytes/pixel, in-place)
//   HIST_BASE          = histogram (256 × 4B)
//   CDF_BASE           = CDF (256 × 4B)
//
// Algorithm:
//   1. Build grayscale histogram (BT.601 weights)
//   2. Compute CDF via prefix sum
//   3. Remap each pixel: newGray = (cdf[gray] - cdfMin) * 255 / (total - cdfMin)
//
// Helpers used: RGBA, Mem.i32Array, Meta.weightedSum, Ctrl.range

const HIST_BASE = 65536; // page 2
const CDF_BASE = HIST_BASE + 1024;

type Exports = {
  equalize: (len: number) => void;
};

function histogramEqualizationWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(4);

    const hist = Mem.i32Array(HIST_BASE);
    const cdf = Mem.i32Array(CDF_BASE);

    yield* Mod.exportFunc("equalize", { len: Type.i32 }, function* (len) {
      const [i, offset, gray, sum, cdfMin, denom, newGray, origR, origG, origB, scale] =
        yield* locals(
          Type.i32, Type.i32, Type.i32, [Type.i32, 0], [Type.i32, 0],
          Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32,
        );

      // --- Phase 1: Build grayscale histogram ---
      yield* Ctrl.range(i, 256, () => [hist.store(i, 0)]);

      yield* Ctrl.range(i, len, function* () {
        yield* offset.set(i.mul(4));
        const px = RGBA.at(offset);

        yield* gray.set(
          Meta.weightedSum([
            { weight: 77, expr: px.r },
            { weight: 150, expr: px.g },
            { weight: 29, expr: px.b },
          ]).shr(8),
        );
        yield* hist.at(gray).incrBy(1);
      });

      // --- Phase 2: CDF via prefix sum ---
      yield* sum.set(0);
      yield* Ctrl.range(i, 256, function* () {
        yield* sum.incrBy(hist.load(i));
        yield* cdf.store(i, sum);
      });

      // Find cdfMin (first non-zero CDF entry)
      yield* cdfMin.set(0);
      yield* Ctrl.range(i, 256, function* () {
        yield* Ctrl.when(cdfMin.eq(0).and(hist.load(i).gt(0)), function* () {
          yield* cdfMin.set(cdf.load(i));
        });
      });

      // denom = total - cdfMin (avoid div by zero: if denom=0, use 1)
      yield* denom.set(Op.max(len.sub(cdfMin), 1));

      // --- Phase 3: Remap each pixel ---
      yield* Ctrl.range(i, len, function* () {
        yield* offset.set(i.mul(4));
        const px = RGBA.at(offset);

        // Compute original grayscale
        yield* origR.set(px.r);
        yield* origG.set(px.g);
        yield* origB.set(px.b);

        yield* gray.set(
          Meta.weightedSum([
            { weight: 77, expr: origR },
            { weight: 150, expr: origG },
            { weight: 29, expr: origB },
          ]).shr(8),
        );

        // newGray = (cdf[gray] - cdfMin) * 255 / denom
        yield* newGray.set(cdf.load(gray).sub(cdfMin).mul(255).div(denom).clamp(0, 255));

        // Scale each channel proportionally: new = orig * newGray / max(gray, 1)
        yield* scale.set(Op.max(gray, 1));
        for (const ch of ["r", "g", "b"] as const) {
          const orig = ch === "r" ? origR : ch === "g" ? origG : origB;
          yield* px[ch].set(orig.mul(newGray).div(scale).clamp(0, 255));
        }
      });
    });
  });
}

export async function histogramEqualization() {
  const binary = histogramEqualizationWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    equalize: exports.equalize,
    setPixels(data: Uint8Array) {
      bytes!.set(data);
    },
    getPixels(n: number): Uint8Array {
      return bytes!.slice(0, n * 4);
    },
    binary,
  };
}
