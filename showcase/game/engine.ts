import { compile, local, locals, Type, Mod, Ctrl, Op, f64 } from "@/dsl/compiler";
import type { VoidStmt, WasmBinary } from "@/dsl/types";
import { Struct, BumpAllocator } from "@/dsl/primitives";

// ── Constants ──────────────────────────────────────────────
const WIDTH = 800;
const HEIGHT = 600;
const PLAYER_SPEED = 300;
const BULLET_SPEED = 500;
export const MAX_BULLETS = 32;
export const MAX_ENEMIES = 48;
const SHOOT_COOLDOWN = 0.15;
const INVINCIBLE_TIME = 2.0;
const INITIAL_LIVES = 3;

// Enemy kinds
const KIND_STRAIGHT = 0;
const KIND_SINE = 1;
const KIND_ZIGZAG = 2;

// Game states
const STATE_PLAYING = 0;
const STATE_GAMEOVER = 1;

// Collision half-sizes (AABB)
const BULLET_HW = 3;
const BULLET_HH = 8;
const ENEMY_HW = 16;
const ENEMY_HH = 16;
const PLAYER_HW = 16;
const PLAYER_HH = 16;

// Wave definitions
const WAVES = [
  { kind: KIND_STRAIGHT, count: 6, speed: 120, spread: 700 },
  { kind: KIND_SINE, count: 5, speed: 80, spread: 600 },
  { kind: KIND_ZIGZAG, count: 7, speed: 100, spread: 700 },
  { kind: KIND_STRAIGHT, count: 8, speed: 150, spread: 750 },
  { kind: KIND_SINE, count: 6, speed: 100, spread: 650 },
] as const;

// ── Struct Definitions ─────────────────────────────────────
const GameState = Struct({
  score: "i32",
  lives: "i32",
  state: "i32",
  waveNum: "i32",
  rngSeed: "i32",
  _pad: "i32",
  waveTimer: "f64",
  shootCd: "f64",
});

const Player = Struct({
  x: "f64",
  y: "f64",
  invTimer: "f64",
});

export const BulletDef = Struct({
  x: "f64",
  y: "f64",
  active: "i32",
});

export const EnemyDef = Struct({
  x: "f64",
  y: "f64",
  vx: "f64",
  vy: "f64",
  active: "i32",
  kind: "i32",
  timer: "f64",
});

// ── Exports type ───────────────────────────────────────────
export type GameExports = {
  init: (seed: number) => void;
  update: (dt: number, input: number) => void;
  getPlayerX: () => number;
  getPlayerY: () => number;
  getPlayerInv: () => number;
  getScore: () => number;
  getLives: () => number;
  getState: () => number;
};

// ── Memory layout byte offsets (for renderer direct read) ──
// All structs have f64 fields → maxAlign=8, sizes are multiples of 8.
// BumpAllocator allocates sequentially with alignment.
export const OFFSETS = {
  playerBase: GameState.size,
  bulletBase: GameState.size + Player.size,
  enemyBase: GameState.size + Player.size + BulletDef.size * MAX_BULLETS,
};

// ── Compile ────────────────────────────────────────────────
export function compileGame(): WasmBinary<GameExports> {
  const alloc = new BumpAllocator();
  const gs = GameState.array(alloc, 1);
  const pl = Player.array(alloc, 1);
  const bul = BulletDef.array(alloc, MAX_BULLETS);
  const ene = EnemyDef.array(alloc, MAX_ENEMIES);

  return compile<GameExports>(function* () {
    yield* Mod.memory(Math.max(alloc.requiredPages, 1));

    const env = yield* Mod.importGroup("env", {
      sin: { params: ["f64"], results: ["f64"] },
    });

    // Singleton accessors — number literal 0 is safe for multi-use
    const g = gs.at(0);
    const p = pl.at(0);

    // ── init ───────────────────────────
    yield* Mod.exportFunc("init", { seed: Type.i32 }, function* (seed) {
      yield* g.score.set(0);
      yield* g.lives.set(INITIAL_LIVES);
      yield* g.state.set(STATE_PLAYING);
      yield* g.waveNum.set(0);
      yield* g.rngSeed.set(seed);
      yield* g.waveTimer.set(f64(1.0));
      yield* g.shootCd.set(f64(0));
      yield* p.x.set(f64(WIDTH / 2));
      yield* p.y.set(f64(HEIGHT - 50));
      yield* p.invTimer.set(f64(0));

      const idx = yield* local(Type.i32);
      yield* Ctrl.range(idx, MAX_BULLETS, () => [bul.at(idx).active.set(0)]);
      yield* Ctrl.range(idx, MAX_ENEMIES, () => [ene.at(idx).active.set(0)]);
    });

    // ── update ─────────────────────────
    yield* Mod.exportFunc(
      "update",
      { dt: Type.f64, input: Type.i32 },
      function* (dt, input) {
        // Guard: skip all logic when game over
        yield* Ctrl.when(g.state.eq(STATE_PLAYING), function* () {
          const [left, right, shoot] = yield* locals(Type.i32, Type.i32, Type.i32);
          yield* left.set(input.and(1));
          yield* right.set(input.shr(1).and(1));
          yield* shoot.set(input.shr(2).and(1));

          // ── 1. Player movement ──
          const dir = yield* local(Type.f64);
          yield* dir.set(Op.toF64(right.sub(left)));
          const newX = yield* local(Type.f64);
          yield* newX.set(p.x.add(dir.mul(f64(PLAYER_SPEED)).mul(dt)));
          yield* p.x.set(newX.add(f64(0)).clamp(f64(PLAYER_HW), f64(WIDTH - PLAYER_HW)));

          // ── 2. Shooting (f64 comparison for proper cooldown) ──
          const cd = yield* local(Type.f64);
          yield* cd.set(Op.f64.sub(g.shootCd, dt));
          yield* g.shootCd.set(cd);
          yield* Ctrl.when(shoot.and(cd.le(f64(0))), function* () {
            const found = yield* local(Type.i32, 0);
            const bi = yield* local(Type.i32);
            yield* Ctrl.range(bi, MAX_BULLETS, function* () {
              yield* Ctrl.when(found.eqz().and(bul.at(bi).active.eqz()), function* () {
                const b = bul.at(bi);
                yield* b.x.set(p.x);
                yield* b.y.set(p.y.sub(f64(20)));
                yield* b.active.set(1);
                yield* found.set(1);
                yield* g.shootCd.set(f64(SHOOT_COOLDOWN));
              });
            });
          });

          // ── 3. Bullet movement ──
          const bi = yield* local(Type.i32);
          yield* Ctrl.range(bi, MAX_BULLETS, function* () {
            yield* Ctrl.when(bul.at(bi).active, function* () {
              const b = bul.at(bi);
              yield* b.y.set(b.y.sub(f64(BULLET_SPEED).mul(dt)));
              yield* Ctrl.when(b.y.toI32().lt(-20), function* () {
                yield* b.active.set(0);
              });
            });
          });

          // ── 4. Wave spawning ──
          const wt = yield* local(Type.f64);
          yield* wt.set(Op.f64.sub(g.waveTimer, dt));
          yield* g.waveTimer.set(wt);

          const rngVal = yield* local(Type.i32);

          yield* Ctrl.when(wt.le(f64(0)), function* () {
            const waveIdx = yield* local(Type.i32);
            yield* waveIdx.set(Op.rem_u(g.waveNum, WAVES.length));

            // Speed scales +20% per full wave cycle
            const loops = yield* local(Type.i32);
            yield* loops.set(Op.div_u(g.waveNum, WAVES.length));
            const speedMul = yield* local(Type.f64);
            yield* speedMul.set(f64(1.0).add(loops.toF64().mul(f64(0.2))));

            const ei = yield* local(Type.i32);
            const spawned = yield* local(Type.i32, 0);

            // Helper: build spawn statements for one wave (array body form)
            type WaveConfig = (typeof WAVES)[number];
            function waveStmts(wave: WaveConfig): VoidStmt[] {
              const stmts: VoidStmt[] = [spawned.set(0)];
              for (let s = 0; s < wave.count; s++) {
                stmts.push(
                  // xorshift32
                  rngVal.set(g.rngSeed),
                  rngVal.xorBy(rngVal.shl(13)),
                  rngVal.xorBy(Op.shr_u(rngVal, 17)),
                  rngVal.xorBy(rngVal.shl(5)),
                  g.rngSeed.set(rngVal),
                  // Find first inactive enemy slot
                  Ctrl.range(ei, MAX_ENEMIES, function* () {
                    yield* Ctrl.when(
                      spawned.lt(s + 1).and(ene.at(ei).active.eqz()),
                      function* () {
                        const e = ene.at(ei);
                        const xPos = f64(50).add(
                          Op.toF64(Op.rem_u(rngVal.and(0x7fff_ffff), wave.spread)),
                        );
                        yield* e.x.set(xPos);
                        yield* e.y.set(f64(-30 - s * 40));
                        yield* e.vy.set(f64(wave.speed).mul(speedMul));
                        yield* e.vx.set(
                          wave.kind === KIND_ZIGZAG ? f64(80).mul(speedMul) : f64(0),
                        );
                        yield* e.active.set(1);
                        yield* e.kind.set(wave.kind);
                        yield* e.timer.set(f64(0));
                        yield* spawned.incrBy(1);
                      },
                    );
                  }),
                );
              }
              return stmts;
            }

            // Build switch via JS loop (compile-time unrolled)
            let sw = Ctrl.switch(waveIdx).case(0, () => waveStmts(WAVES[0]));
            for (let i = 1; i < WAVES.length; i++) {
              sw = sw.case(i, () => waveStmts(WAVES[i]));
            }
            yield* sw;

            yield* g.waveNum.incrBy(1);
            yield* g.waveTimer.set(f64(3.0));
          });

          // ── 5. Enemy movement ──
          const ei2 = yield* local(Type.i32);
          yield* Ctrl.range(ei2, MAX_ENEMIES, function* () {
            yield* Ctrl.when(ene.at(ei2).active, function* () {
              const e = ene.at(ei2);
              yield* e.timer.set(Op.f64.add(e.timer, dt));

              yield* Ctrl.switch(e.kind)
                .case(KIND_STRAIGHT, function* () {
                  yield* e.y.set(e.y.add(e.vy.mul(dt)));
                })
                .case(KIND_SINE, function* () {
                  yield* e.y.set(e.y.add(e.vy.mul(dt)));
                  const sinV = yield* local(Type.f64);
                  yield* sinV.set(env.sin(e.timer.mul(f64(3.0))));
                  yield* e.x.set(e.x.add(sinV.mul(f64(100.0)).mul(dt)));
                })
                .case(KIND_ZIGZAG, function* () {
                  yield* e.y.set(e.y.add(e.vy.mul(dt)));
                  yield* e.x.set(e.x.add(e.vx.mul(dt)));
                  yield* Ctrl.when(e.x.toI32().lt(20), function* () {
                    yield* e.vx.set(e.vx.abs());
                  });
                  yield* Ctrl.when(e.x.toI32().gt(WIDTH - 20), function* () {
                    yield* e.vx.set(e.vx.neg());
                  });
                });

              yield* Ctrl.when(e.y.toI32().gt(HEIGHT + 30), function* () {
                yield* e.active.set(0);
              });
            });
          });

          // ── 6. Bullet × Enemy collision ──
          const ci = yield* local(Type.i32);
          const cj = yield* local(Type.i32);
          yield* Ctrl.range(ci, MAX_BULLETS, function* () {
            yield* Ctrl.when(bul.at(ci).active, function* () {
              const { x: bx, y: by } = yield* bul.snapshot(ci, "x", "y");
              yield* Ctrl.range(cj, MAX_ENEMIES, function* () {
                yield* Ctrl.when(ene.at(cj).active.and(bul.at(ci).active), function* () {
                  const { x: ex, y: ey } = yield* ene.snapshot(cj, "x", "y");
                  const hw = BULLET_HW + ENEMY_HW;
                  const hh = BULLET_HH + ENEMY_HH;
                  yield* Ctrl.when(
                    bx.sub(ex).abs().toI32().lt(hw).and(by.sub(ey).abs().toI32().lt(hh)),
                    function* () {
                      yield* bul.at(ci).active.set(0);
                      yield* ene.at(cj).active.set(0);
                      yield* g.score.incrBy(100);
                    },
                  );
                });
              });
            });
          });

          // ── 7. Enemy × Player collision ──
          const invT = yield* local(Type.f64);
          yield* invT.set(p.invTimer);
          yield* Ctrl.when(invT.le(f64(0)), function* () {
            const pi = yield* local(Type.i32);
            const { x: px, y: py } = yield* pl.snapshot(0, "x", "y");
            yield* Ctrl.range(pi, MAX_ENEMIES, function* () {
              yield* Ctrl.when(ene.at(pi).active, function* () {
                const { x: exx, y: eyy } = yield* ene.snapshot(pi, "x", "y");
                const hw = PLAYER_HW + ENEMY_HW;
                const hh = PLAYER_HH + ENEMY_HH;
                yield* Ctrl.when(
                  px.sub(exx).abs().toI32().lt(hw).and(py.sub(eyy).abs().toI32().lt(hh)),
                  function* () {
                    yield* ene.at(pi).active.set(0);
                    yield* g.lives.set(g.lives.sub(1));
                    yield* p.invTimer.set(f64(INVINCIBLE_TIME));
                    yield* Ctrl.when(g.lives.le(0), function* () {
                      yield* g.state.set(STATE_GAMEOVER);
                    });
                  },
                );
              });
            });
          });

          // ── 8. Invincibility timer ──
          yield* invT.set(p.invTimer);
          yield* Ctrl.when(invT.gt(f64(0)), function* () {
            yield* p.invTimer.set(Op.f64.sub(p.invTimer, dt));
          });
        }); // end STATE_PLAYING guard
      },
    );

    // ── Getter exports ─────────────────
    yield* Mod.exportFunc("getPlayerX", {}, function* () {
      return yield* p.x;
    });
    yield* Mod.exportFunc("getPlayerY", {}, function* () {
      return yield* p.y;
    });
    yield* Mod.exportFunc("getPlayerInv", {}, function* () {
      return yield* p.invTimer;
    });
    yield* Mod.exportFunc("getScore", {}, function* () {
      return yield* g.score;
    });
    yield* Mod.exportFunc("getLives", {}, function* () {
      return yield* g.lives;
    });
    yield* Mod.exportFunc("getState", {}, function* () {
      return yield* g.state;
    });
  });
}
