import { instantiate } from "@/runtime/instantiate";
import { compileGame } from "./engine";
import { GameRenderer } from "./renderer";

// ── Compile & Instantiate ──────────────────────────────────
async function boot() {
  const binary = compileGame();
  const { exports, bytes } = await instantiate(binary, {
    env: { sin: Math.sin },
  });

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const renderer = new GameRenderer(canvas, exports, bytes!.buffer);

  // ── Input state ──
  let inputBits = 0;
  const KEY_LEFT = 1;
  const KEY_RIGHT = 2;
  const KEY_SHOOT = 4;

  function keyBit(e: KeyboardEvent): number {
    if (e.code === "ArrowLeft" || e.code === "KeyA") return KEY_LEFT;
    if (e.code === "ArrowRight" || e.code === "KeyD") return KEY_RIGHT;
    if (e.code === "Space") return KEY_SHOOT;
    return 0;
  }

  window.addEventListener("keydown", (e) => {
    const bit = keyBit(e);
    if (bit) {
      e.preventDefault();
      inputBits |= bit;
    }
    // Restart on Space when game over
    if (e.code === "Space" && exports.getState() === 1) {
      exports.init(Date.now() | 1);
    }
  });
  window.addEventListener("keyup", (e) => {
    inputBits &= ~keyBit(e);
  });

  // ── Init & Game Loop ──
  exports.init(Date.now() | 1);

  let lastTime = performance.now();
  function loop(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.05); // cap to 50ms
    lastTime = now;

    exports.update(dt, inputBits);
    renderer.draw(dt);

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot();
