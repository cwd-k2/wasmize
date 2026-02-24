import { OFFSETS, BulletDef, EnemyDef, MAX_BULLETS, MAX_ENEMIES } from "./engine";
import type { GameExports } from "./engine";

const WIDTH = 800;
const HEIGHT = 600;

// ── Star field (3-layer parallax) ──────────────────────────
interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
}

function createStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(Math.random() * 3);
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      speed: 20 + layer * 30,
      size: 0.5 + layer * 0.7,
      alpha: 0.3 + layer * 0.25,
    });
  }
  return stars;
}

// ── Renderer ───────────────────────────────────────────────
export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[];
  private frame = 0;
  private f64View: Float64Array;
  private i32View: Int32Array;

  constructor(
    canvas: HTMLCanvasElement,
    private exports: GameExports,
    buffer: ArrayBuffer,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.stars = createStars(200);
    this.f64View = new Float64Array(buffer);
    this.i32View = new Int32Array(buffer);
  }

  draw(dt: number): void {
    const { ctx } = this;
    this.frame++;

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Stars
    this.drawStars(dt);

    // Bullets
    this.drawBullets();

    // Enemies
    this.drawEnemies();

    // Player
    this.drawPlayer();

    // HUD
    this.drawHUD();

    // Game Over overlay
    if (this.exports.getState() === 1) {
      this.drawGameOver();
    }
  }

  private drawStars(dt: number): void {
    const { ctx, stars } = this;
    for (const star of stars) {
      star.y += star.speed * dt;
      if (star.y > HEIGHT) {
        star.y -= HEIGHT;
        star.x = Math.random() * WIDTH;
      }
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(): void {
    const { ctx, exports, frame } = this;
    const px = exports.getPlayerX();
    const py = exports.getPlayerY();
    const inv = exports.getPlayerInv();

    // Blink during invincibility (6-frame period)
    if (inv > 0 && Math.floor(frame / 3) % 2 === 0) return;

    ctx.save();
    ctx.shadowColor = "#58a6ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#58a6ff";
    ctx.beginPath();
    ctx.moveTo(px, py - 16);
    ctx.lineTo(px - 12, py + 12);
    ctx.lineTo(px + 12, py + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBullets(): void {
    const { ctx, f64View, i32View } = this;
    const base = OFFSETS.bulletBase;

    ctx.save();
    ctx.shadowColor = "#7ee787";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#7ee787";

    for (let i = 0; i < MAX_BULLETS; i++) {
      const byteOff = base + i * BulletDef.size;
      // active is at offset: 2 × f64 = 16 bytes → i32 view index = byteOff/4 + 4
      const active = i32View[byteOff / 4 + 4]; // active field after 2 f64s
      if (!active) continue;
      const x = f64View[byteOff / 8];     // x field
      const y = f64View[byteOff / 8 + 1]; // y field
      ctx.fillRect(x - 2, y - 6, 4, 12);
    }

    ctx.restore();
  }

  private drawEnemies(): void {
    const { ctx, f64View, i32View } = this;
    const base = OFFSETS.enemyBase;

    ctx.save();
    ctx.shadowBlur = 10;

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const byteOff = base + i * EnemyDef.size;
      // Enemy layout: x(f64), y(f64), vx(f64), vy(f64), active(i32), kind(i32), timer(f64)
      const activeOff = byteOff + 4 * 8; // after 4 f64s
      const active = i32View[activeOff / 4];
      if (!active) continue;
      const kind = i32View[activeOff / 4 + 1];
      const x = f64View[byteOff / 8];
      const y = f64View[byteOff / 8 + 1];

      if (kind === 0) {
        // Straight: diamond
        ctx.shadowColor = "#f85149";
        ctx.fillStyle = "#f85149";
        ctx.beginPath();
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x + 12, y);
        ctx.lineTo(x, y + 14);
        ctx.lineTo(x - 12, y);
        ctx.closePath();
        ctx.fill();
      } else if (kind === 1) {
        // Sine: circle
        ctx.shadowColor = "#d2a8ff";
        ctx.fillStyle = "#d2a8ff";
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Zigzag: X shape
        ctx.shadowColor = "#ffa657";
        ctx.strokeStyle = "#ffa657";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 10);
        ctx.lineTo(x + 10, y + 10);
        ctx.moveTo(x + 10, y - 10);
        ctx.lineTo(x - 10, y + 10);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawHUD(): void {
    const { ctx, exports } = this;
    const score = exports.getScore();
    const lives = exports.getLives();

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#e6edf3";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${score}`, 20, 32);

    // Lives as small ship icons
    ctx.textAlign = "right";
    ctx.fillStyle = "#58a6ff";
    for (let i = 0; i < lives; i++) {
      const lx = WIDTH - 24 - i * 28;
      ctx.beginPath();
      ctx.moveTo(lx, 18);
      ctx.lineTo(lx - 8, 34);
      ctx.lineTo(lx + 8, 34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGameOver(): void {
    const { ctx, exports } = this;

    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 15, 0.7)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.shadowColor = "#f85149";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#f85149";
    ctx.font = "bold 48px monospace";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", WIDTH / 2, HEIGHT / 2 - 30);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e6edf3";
    ctx.font = "24px monospace";
    ctx.fillText(`Score: ${exports.getScore()}`, WIDTH / 2, HEIGHT / 2 + 20);

    ctx.fillStyle = "#8b949e";
    ctx.font = "16px monospace";
    ctx.fillText("Press Space to restart", WIDTH / 2, HEIGHT / 2 + 60);
    ctx.restore();
  }
}
