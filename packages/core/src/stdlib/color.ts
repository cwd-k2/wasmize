/**
 * Color conversion functions for Wasm.
 *
 * - `rgbToHsl`: RGB (0.0-1.0) to HSL (H: 0-360, S: 0-1, L: 0-1)
 * - `hslToRgb`: HSL to RGB (0.0-1.0)
 *
 * All values stored as f64 at the provided memory addresses.
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl, Op } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * rgbToHsl(r, g, b, dstH, dstS, dstL) — converts RGB to HSL.
 *
 * Input: r, g, b as f64 in [0, 1].
 * Output: H (0-360), S (0-1), L (0-1) stored as f64 at dstH, dstS, dstL.
 *
 * Params: r (f64), g (f64), b (f64), dstH (i32), dstS (i32), dstL (i32).
 */
export const rgbToHsl: StdlibFunc = {
  params: ["f64", "f64", "f64", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const r = yield* param(Type.f64);
    const g = yield* param(Type.f64);
    const b = yield* param(Type.f64);
    const dstH = yield* param(Type.i32);
    const dstS = yield* param(Type.i32);
    const dstL = yield* param(Type.i32);

    // Find min and max of r, g, b using f64 min/max
    const maxVal = yield* local(Type.f64, Op.f64.max(Op.f64.max(r, g), b));
    const minVal = yield* local(Type.f64, Op.f64.min(Op.f64.min(r, g), b));
    const delta = yield* local(Type.f64, maxVal.sub(minVal));

    // L = (max + min) / 2
    const l = yield* local(Type.f64, maxVal.add(minVal).mul(Mem.f64(0.5)));
    yield* Mem.storeF64(dstL, l);

    yield* Ctrl.if(delta.eq(Mem.f64(0.0)))
      .then(function* () {
        // Achromatic: H = 0, S = 0
        yield* Mem.storeF64(dstH, Mem.f64(0.0));
        yield* Mem.storeF64(dstS, Mem.f64(0.0));
      })
      .else(function* () {
        // S = delta / (1 - |2L - 1|)
        const s = yield* local(Type.f64);
        const denom = yield* local(Type.f64, Mem.f64(2.0).mul(l).sub(Mem.f64(1.0)).abs());
        yield* s.set(delta.div(Mem.f64(1.0).sub(denom)));
        yield* Mem.storeF64(dstS, s);

        // H
        const h = yield* local(Type.f64);

        yield* Ctrl.if(maxVal.eq(r))
          .then(function* () {
            // H = 60 * ((g - b) / delta mod 6)
            const segment = yield* local(Type.f64, g.sub(b).div(delta));
            // Modulo 6: if segment < 0, add 6
            yield* Ctrl.when(segment.lt(Mem.f64(0.0)), () => [
              segment.set(segment.add(Mem.f64(6.0))),
            ]);
            yield* h.set(Mem.f64(60.0).mul(segment));
          })
          .elseif(maxVal.eq(g))
          .then(function* () {
            // H = 60 * ((b - r) / delta + 2)
            yield* h.set(Mem.f64(60.0).mul(b.sub(r).div(delta).add(Mem.f64(2.0))));
          })
          .else(function* () {
            // H = 60 * ((r - g) / delta + 4)
            yield* h.set(Mem.f64(60.0).mul(r.sub(g).div(delta).add(Mem.f64(4.0))));
          });

        // Ensure H >= 0
        yield* Ctrl.when(h.lt(Mem.f64(0.0)), () => [
          h.set(h.add(Mem.f64(360.0))),
        ]);

        yield* Mem.storeF64(dstH, h);
      });
  },
};

/**
 * hslToRgb(h, s, l, dstR, dstG, dstB) — converts HSL to RGB.
 *
 * Input: H (0-360), S (0-1), L (0-1) as f64.
 * Output: r, g, b (0-1) stored as f64 at dstR, dstG, dstB.
 *
 * Params: h (f64), s (f64), l (f64), dstR (i32), dstG (i32), dstB (i32).
 */
export const hslToRgb: StdlibFunc = {
  params: ["f64", "f64", "f64", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const h = yield* param(Type.f64);
    const s = yield* param(Type.f64);
    const l = yield* param(Type.f64);
    const dstR = yield* param(Type.i32);
    const dstG = yield* param(Type.i32);
    const dstB = yield* param(Type.i32);

    // Use if/else to handle achromatic vs chromatic
    yield* Ctrl.if(s.eq(Mem.f64(0.0)))
      .then(function* () {
        // Achromatic case: all channels = L
        yield* Mem.storeF64(dstR, l);
        yield* Mem.storeF64(dstG, l);
        yield* Mem.storeF64(dstB, l);
      })
      .else(function* () {
        // C = (1 - |2L - 1|) * S
        const c = yield* local(Type.f64);
        yield* c.set(Mem.f64(1.0).sub(Mem.f64(2.0).mul(l).sub(Mem.f64(1.0)).abs()).mul(s));

        // H' = H / 60
        const hPrime = yield* local(Type.f64, h.div(Mem.f64(60.0)));

        // X = C * (1 - |H' mod 2 - 1|)
        // H' mod 2: subtract floor(H'/2)*2
        const hMod2 = yield* local(Type.f64, hPrime.sub(hPrime.div(Mem.f64(2.0)).floor().mul(Mem.f64(2.0))));
        const x = yield* local(Type.f64, c.mul(Mem.f64(1.0).sub(hMod2.sub(Mem.f64(1.0)).abs())));

        // m = L - C/2
        const m = yield* local(Type.f64, l.sub(c.mul(Mem.f64(0.5))));

        const r1 = yield* local(Type.f64, Mem.f64(0.0));
        const g1 = yield* local(Type.f64, Mem.f64(0.0));
        const b1 = yield* local(Type.f64, Mem.f64(0.0));

        // Select (r1, g1, b1) based on H' sector
        yield* Ctrl.if(hPrime.lt(Mem.f64(1.0)))
          .then(() => [r1.set(c), g1.set(x), b1.set(Mem.f64(0.0))])
          .elseif(hPrime.lt(Mem.f64(2.0)))
          .then(() => [r1.set(x), g1.set(c), b1.set(Mem.f64(0.0))])
          .elseif(hPrime.lt(Mem.f64(3.0)))
          .then(() => [r1.set(Mem.f64(0.0)), g1.set(c), b1.set(x)])
          .elseif(hPrime.lt(Mem.f64(4.0)))
          .then(() => [r1.set(Mem.f64(0.0)), g1.set(x), b1.set(c)])
          .elseif(hPrime.lt(Mem.f64(5.0)))
          .then(() => [r1.set(x), g1.set(Mem.f64(0.0)), b1.set(c)])
          .else(() => [r1.set(c), g1.set(Mem.f64(0.0)), b1.set(x)]);

        yield* Mem.storeF64(dstR, r1.add(m));
        yield* Mem.storeF64(dstG, g1.add(m));
        yield* Mem.storeF64(dstB, b1.add(m));
      });
  },
};
