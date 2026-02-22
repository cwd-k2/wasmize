import { locals, Type, Mod, Mem, Ctrl, Meta, RGBA } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";
import { instantiate } from "wasmize/runtime/instantiate";

// 256-bucket grayscale histogram + cumulative distribution function (CDF)
// Memory layout:
//   offset 0          = grayscale pixel data (1 byte/pixel)
//   offset HIST_OFFSET = histogram (256 × 4B = 1024 bytes)
//   offset CDF_OFFSET  = CDF (256 × 4B = 1024 bytes)
//
// Meta patterns used:
// - Meta.weightedSum: BT.601 grayscale computation
// - Meta.times: unrolled histogram bucket clearing

const HIST_OFFSET = 65536; // start of page 2
const CDF_OFFSET = HIST_OFFSET + 1024;

type Exports = {
  histogram: (len: number) => void;
  histogramRgba: (len: number) => void;
  cdf: () => void;
};

function histogramWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(2);

    const hist = Mem.i32Array(HIST_OFFSET);
    const cdfArr = Mem.i32Array(CDF_OFFSET);

    // histogram: count occurrences of each byte value (grayscale input)
    yield* Mod.exportFunc("histogram", { len: Type.i32 }, function* (len) {
      const [i, val] = yield* locals([Type.i32, 0], Type.i32);

      // Clear histogram buckets
      yield* Ctrl.range(i, 256, () => [hist.store(i, 0)]);

      // Count each pixel value
      yield* i.set(0);
      yield* Ctrl.while(i.lt(len), () => [
        val.set(Mem.load8(i)),
        hist.at(val).incrBy(1),
        i.incrBy(1),
      ]);
    });

    // histogramRgba: compute grayscale from RGBA, then histogram
    yield* Mod.exportFunc("histogramRgba", { len: Type.i32 }, function* (len) {
      const [i, offset, gray] = yield* locals([Type.i32, 0], Type.i32, Type.i32);

      // Clear histogram buckets
      yield* Ctrl.range(i, 256, () => [hist.store(i, 0)]);

      // For each RGBA pixel: grayscale → bucket
      yield* i.set(0);
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

        yield* hist.at(gray).incrBy(1);
        yield* i.incrBy(1);
      });
    });

    // cdf: prefix sum over histogram → cumulative distribution function
    yield* Mod.exportFunc("cdf", function* () {
      const [i, sum] = yield* locals(Type.i32, [Type.i32, 0]);

      yield* Ctrl.range(i, 256, () => [
        sum.incrBy(hist.load(i)),
        cdfArr.store(i, sum),
      ]);
    });
  });
}

export async function histogram() {
  const binary = histogramWasm();
  const { exports, bytes } = await instantiate(binary);

  const mem32 = new Uint32Array(bytes!.buffer);

  return {
    histogram: exports.histogram,
    histogramRgba: exports.histogramRgba,
    cdf: exports.cdf,
    setGrayscaleData(data: Uint8Array) {
      bytes!.set(data);
    },
    setRgbaData(data: Uint8Array) {
      bytes!.set(data);
    },
    getBucket(value: number): number {
      return mem32[(HIST_OFFSET >> 2) + value];
    },
    getCdf(value: number): number {
      return mem32[(CDF_OFFSET >> 2) + value];
    },
    binary,
  };
}
