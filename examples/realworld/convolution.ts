import { local, Type, Mod, Mem, Ctrl, Meta, RGBA } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/test-helpers";

// 3x3 Image Convolution: blur, sharpen, edge detection
// Memory layout: offset 0 = input RGBA pixels, offset inputSize = output RGBA pixels
// Each pixel is 4 bytes (RGBA). Alpha is copied unchanged.
//
// Meta patterns used:
// - Meta.weightedSum: 3x3 kernel coefficient accumulation
// - Meta.each: channel iteration + kernel 2D expansion

type Exports = {
  convolve: (w: number, h: number, divisor: number) => void;
};

// 3x3 kernels stored as flat 9-element arrays (row-major)
const KERNELS = {
  blur: [1, 1, 1, 1, 1, 1, 1, 1, 1], // divisor=9
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0], // divisor=1
  edge: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // divisor=1
};

// Kernel offsets: (dy, dx) pairs for 3x3 centered at (0,0)
const KERNEL_OFFSETS = [
  { dy: -1, dx: -1 }, { dy: -1, dx: 0 }, { dy: -1, dx: 1 },
  { dy: 0, dx: -1 }, { dy: 0, dx: 0 }, { dy: 0, dx: 1 },
  { dy: 1, dx: -1 }, { dy: 1, dx: 0 }, { dy: 1, dx: 1 },
];

function convolutionWasm(kernel: number[]) {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(4); // 2 pages input + 2 pages output

    yield* Mod.exportFunc(
      "convolve",
      { w: Type.i32, h: Type.i32, divisor: Type.i32 },
      function* (w, h, divisor) {
        const x = yield* local(Type.i32);
        const y = yield* local(Type.i32);
        const inputSize = yield* local(Type.i32);
        const dstAddr = yield* local(Type.i32);
        const srcAddr = yield* local(Type.i32);
        const ch = yield* local(Type.i32);

        yield* inputSize.set(w.mul(h).mul(4));

        // Process interior pixels (skip 1-pixel border)
        yield* Ctrl.range(y, 1, h.sub(1), function* () {
          yield* Ctrl.range(x, 1, w.sub(1), function* () {
            yield* dstAddr.set(inputSize.add(y.mul(w).add(x).mul(4)));
            yield* srcAddr.set(y.mul(w).add(x).mul(4));
            const dstPx = RGBA.at(dstAddr);
            const srcPx = RGBA.at(srcAddr);

            // Convolve each RGB channel independently
            const channels = ["r", "g", "b"] as const;
            yield* Meta.each(channels, (c, ci) => [
              ch.set(
                Meta.weightedSum(
                  kernel.map((weight, ki) => ({
                    weight,
                    expr: Mem.load8(
                      y.add(KERNEL_OFFSETS[ki]!.dy)
                        .mul(w)
                        .add(x.add(KERNEL_OFFSETS[ki]!.dx))
                        .mul(4)
                        .add(ci),
                    ),
                  })),
                ).div(divisor).clamp(0, 255),
              ),
              dstPx[c].set(ch),
            ]);

            // Copy alpha unchanged
            yield* dstPx.a.set(srcPx.a);
          });
        });
      },
    );
  });
}

export async function convolution(kernelName: keyof typeof KERNELS = "blur") {
  const kernel = KERNELS[kernelName];
  const binary = convolutionWasm(kernel);
  const { exports, bytes } = await instantiate(binary);

  return {
    convolve: exports.convolve,
    setPixels(data: Uint8Array) {
      bytes!.set(data);
    },
    getOutput(w: number, h: number): Uint8Array {
      const inputSize = w * h * 4;
      return bytes!.slice(inputSize, inputSize + w * h * 4);
    },
    binary,
  };
}
