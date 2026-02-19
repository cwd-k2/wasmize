import { compile, local, Type, Mod, Ctrl, Op } from "@/dsl/compiler";
import { Struct, BumpAllocator } from "@/dsl/primitives";
import { f64 } from "@/dsl/primitives";
import { instantiate } from "@/test-helpers";

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

  const binary = compile<Exports>(function* () {
    yield* Mod.memory(Math.max(alloc.requiredPages, 1));

    // step: x += vx*dt, y += vy*dt
    yield* Mod.exportFunc(
      "step",
      { n: Type.i32, dt: Type.f64 },
      function* (n, dt) {
        const i = yield* local(Type.i32, 0);

        yield* Ctrl.while(i.lt(n), function* () {
          yield* particles.set(
            i,
            "x",
            particles.get(i, "x").add(particles.get(i, "vx").mul(dt)),
          );
          yield* particles.set(
            i,
            "y",
            particles.get(i, "y").add(particles.get(i, "vy").mul(dt)),
          );
          yield* i.incrBy(1);
        });
      },
    );

    // applyGravity: vx += gx, vy += gy
    yield* Mod.exportFunc(
      "applyGravity",
      { n: Type.i32, gx: Type.f64, gy: Type.f64 },
      function* (n, gx, gy) {
        const i = yield* local(Type.i32, 0);

        yield* Ctrl.while(i.lt(n), function* () {
          yield* particles.set(
            i,
            "vx",
            particles.get(i, "vx").add(gx),
          );
          yield* particles.set(
            i,
            "vy",
            particles.get(i, "vy").add(gy),
          );
          yield* i.incrBy(1);
        });
      },
    );

    // bounce: 壁反射 — 完全弾性反射（速度反転 + 位置クランプ）
    yield* Mod.exportFunc(
      "bounce",
      { n: Type.i32, w: Type.f64, h: Type.f64 },
      function* (n, w, h) {
        const i = yield* local(Type.i32, 0);
        const x = yield* local(Type.f64);
        const y = yield* local(Type.f64);

        yield* Ctrl.while(i.lt(n), function* () {
          yield* x.set(particles.get(i, "x"));
          yield* y.set(particles.get(i, "y"));

          // Left wall: x < 0
          yield* Ctrl.when(x.lt(f64(0)), function* () {
            yield* particles.set(i, "x", Op.f64.neg(x));
            yield* particles.set(
              i,
              "vx",
              Op.f64.neg(particles.get(i, "vx")),
            );
          });

          // Reload x after potential modification
          yield* x.set(particles.get(i, "x"));

          // Right wall: x > w
          yield* Ctrl.when(x.gt(w), function* () {
            yield* particles.set(i, "x", Op.f64.sub(w.mul(f64(2)), x));
            yield* particles.set(
              i,
              "vx",
              Op.f64.neg(particles.get(i, "vx")),
            );
          });

          // Top wall: y < 0
          yield* Ctrl.when(y.lt(f64(0)), function* () {
            yield* particles.set(i, "y", Op.f64.neg(y));
            yield* particles.set(
              i,
              "vy",
              Op.f64.neg(particles.get(i, "vy")),
            );
          });

          // Reload y after potential modification
          yield* y.set(particles.get(i, "y"));

          // Bottom wall: y > h
          yield* Ctrl.when(y.gt(h), function* () {
            yield* particles.set(i, "y", Op.f64.sub(h.mul(f64(2)), y));
            yield* particles.set(
              i,
              "vy",
              Op.f64.neg(particles.get(i, "vy")),
            );
          });

          yield* i.incrBy(1);
        });
      },
    );
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
