import { local, Type, Mod, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { Struct, BumpAllocator } from "@/dsl/primitives";
import { f64 } from "@/dsl/primitives";
import { instantiate } from "@/runtime/instantiate";

// 2D particle simulation using Struct + BumpAllocator + f64
// Particle = { x: f64, y: f64, vx: f64, vy: f64 } = 32 bytes

const MAX_PARTICLES = 1000;

const Particle = Struct({ x: "f64", y: "f64", vx: "f64", vy: "f64" });

type Exports = {
  step: (n: number, dt: number) => void;
  applyGravity: (n: number, gx: number, gy: number) => void;
  bounce: (n: number, w: number, h: number) => void;
};

function particlesWasm() {
  const alloc = new BumpAllocator();
  const particles = Particle.array(alloc, MAX_PARTICLES);

  const binary = compileWithWat<Exports>(function* () {
    yield* Mod.memory(Math.max(alloc.requiredPages, 1));

    // step: x += vx*dt, y += vy*dt
    yield* Mod.exportFunc("step", { n: Type.i32, dt: Type.f64 }, function* (n, dt) {
      const i = yield* local(Type.i32);

      yield* Ctrl.range(i, n, function* () {
        const p = particles.at(i);
        yield* p.x.set(p.x.add(p.vx.mul(dt)));
        yield* p.y.set(p.y.add(p.vy.mul(dt)));
      });
    });

    // applyGravity: vx += gx, vy += gy
    yield* Mod.exportFunc(
      "applyGravity",
      { n: Type.i32, gx: Type.f64, gy: Type.f64 },
      function* (n, gx, gy) {
        const i = yield* local(Type.i32);

        yield* Ctrl.range(i, n, function* () {
          const p = particles.at(i);
          yield* p.vx.set(p.vx.add(gx));
          yield* p.vy.set(p.vy.add(gy));
        });
      },
    );

    // bounce: 壁反射 — 完全弾性反射（速度反転 + 位置クランプ）
    yield* Mod.exportFunc("bounce", { n: Type.i32, w: Type.f64, h: Type.f64 }, function* (n, w, h) {
      const i = yield* local(Type.i32);
      const x = yield* local(Type.f64);
      const y = yield* local(Type.f64);

      yield* Ctrl.range(i, n, function* () {
        const p = particles.at(i);

        const axes = [
          { pos: "x", vel: "vx", coord: x, bound: w },
          { pos: "y", vel: "vy", coord: y, bound: h },
        ] as const;

        for (const { pos, vel, coord, bound } of axes) {
          yield* coord.set(p[pos]);

          // min wall: coord < 0
          yield* Ctrl.when(coord.lt(f64(0)), function* () {
            yield* p[pos].set(coord.neg());
            yield* p[vel].set(p[vel].neg());
          });

          yield* coord.set(p[pos]); // reload after potential modification

          // max wall: coord > bound
          yield* Ctrl.when(coord.gt(bound), function* () {
            yield* p[pos].set(bound.mul(f64(2)).sub(coord));
            yield* p[vel].set(p[vel].neg());
          });
        }
      });
    });
  });

  return { binary, particles, alloc };
}

export async function particles() {
  const { binary, particles: _particles } = particlesWasm();
  const { exports, bytes } = await instantiate(binary);

  const f64View = new Float64Array(bytes!.buffer);

  return {
    step: exports.step,
    applyGravity: exports.applyGravity,
    bounce: exports.bounce,
    setParticle(i: number, x: number, y: number, vx: number, vy: number) {
      const base = (i * Particle.size) / 8; // f64 offset
      f64View[base] = x;
      f64View[base + 1] = y;
      f64View[base + 2] = vx;
      f64View[base + 3] = vy;
    },
    getParticle(i: number): { x: number; y: number; vx: number; vy: number } {
      const base = (i * Particle.size) / 8;
      return {
        x: f64View[base],
        y: f64View[base + 1],
        vx: f64View[base + 2],
        vy: f64View[base + 3],
      };
    },
    binary,
  };
}
