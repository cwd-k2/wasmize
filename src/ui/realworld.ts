import {
  runRealworldDemos,
  type GrayscaleDemo,
  type GameOfLifeDemo,
  type CRC32Demo,
  type ParticlesDemo,
} from "../realworld-runner";

export async function renderRealworld(): Promise<void> {
  const demos = await runRealworldDemos();
  const container = document.getElementById("realworld")!;

  for (const demo of demos) {
    const card = document.createElement("div");
    card.className = "demo-card";

    const header = document.createElement("div");
    header.className = "demo-header";
    header.innerHTML = `
      <span class="demo-title">${demo.title}</span>
      <span class="demo-size">${demo.wasmSize} bytes</span>
    `;
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "demo-body";
    card.appendChild(body);

    switch (demo.kind) {
      case "grayscale":
        renderGrayscale(body, demo);
        break;
      case "game-of-life":
        renderGameOfLife(body, demo);
        break;
      case "crc32":
        renderCRC32(body, demo);
        break;
      case "particles":
        renderParticles(body, demo);
        break;
    }

    container.appendChild(card);
  }
}

function renderGrayscale(container: HTMLElement, demo: GrayscaleDemo) {
  const SIZE = 16;
  const SCALE = 12;
  const canvasSize = SIZE * SCALE;

  container.innerHTML = `
    <div class="demo-row">
      <div>
        <div class="section-label">Original</div>
        <canvas class="demo-canvas" width="${canvasSize}" height="${canvasSize}" data-id="original"></canvas>
      </div>
      <div>
        <div class="section-label">Processed</div>
        <canvas class="demo-canvas" width="${canvasSize}" height="${canvasSize}" data-id="processed"></canvas>
      </div>
    </div>
    <div class="demo-controls">
      <button data-action="grayscale">Grayscale</button>
      <button data-action="bright-up">Brightness +50</button>
      <button data-action="bright-down">Brightness -50</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const originalCanvas = container.querySelector(
    '[data-id="original"]',
  ) as HTMLCanvasElement;
  const processedCanvas = container.querySelector(
    '[data-id="processed"]',
  ) as HTMLCanvasElement;
  const origCtx = originalCanvas.getContext("2d")!;
  const procCtx = processedCanvas.getContext("2d")!;

  // Generate RGB gradient
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = (x / SIZE) * 255; // R
      pixels[i + 1] = (y / SIZE) * 255; // G
      pixels[i + 2] = ((SIZE - x) / SIZE) * 255; // B
      pixels[i + 3] = 255; // A
    }
  }

  function drawToCanvas(
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    size: number,
    scale: number,
  ) {
    const imageData = ctx.createImageData(size, size);
    imageData.data.set(data);
    // Scale up using temporary canvas
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    tmp.getContext("2d")!.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, size * scale, size * scale);
  }

  function reset() {
    drawToCanvas(origCtx, pixels, SIZE, SCALE);
    demo.setPixels(pixels);
    drawToCanvas(procCtx, pixels, SIZE, SCALE);
  }

  reset();

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;

    if (action === "reset") {
      reset();
      return;
    }

    if (action === "grayscale") {
      demo.setPixels(pixels);
      demo.grayscale(SIZE * SIZE);
    } else if (action === "bright-up") {
      demo.brightness(SIZE * SIZE, 50);
    } else if (action === "bright-down") {
      demo.brightness(SIZE * SIZE, -50);
    }

    drawToCanvas(procCtx, demo.getPixels(SIZE * SIZE), SIZE, SCALE);
  });
}

function renderGameOfLife(container: HTMLElement, demo: GameOfLifeDemo) {
  const W = 32;
  const H = 32;
  const CELL = 6;

  container.innerHTML = `
    <canvas class="demo-canvas" width="${W * CELL}" height="${H * CELL}" data-id="life"></canvas>
    <div class="demo-controls">
      <button data-action="start">Start</button>
      <button data-action="stop">Stop</button>
      <button data-action="step">Step</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const canvas = container.querySelector(
    '[data-id="life"]',
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let animId: number | null = null;

  function initGlider() {
    const grid = new Array(W * H).fill(0);
    // Glider at (1, 1)
    grid[1 * W + 2] = 1;
    grid[2 * W + 3] = 1;
    grid[3 * W + 1] = 1;
    grid[3 * W + 2] = 1;
    grid[3 * W + 3] = 1;
    // Second glider at (10, 10)
    grid[10 * W + 12] = 1;
    grid[11 * W + 13] = 1;
    grid[12 * W + 11] = 1;
    grid[12 * W + 12] = 1;
    grid[12 * W + 13] = 1;
    demo.setGrid(grid);
  }

  function draw() {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W * CELL, H * CELL);
    ctx.fillStyle = "#7ee787";
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (demo.getCell(x, y, W)) {
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
  }

  let lastTime = 0;
  function animate(time: number) {
    if (time - lastTime > 100) {
      demo.step(W, H);
      draw();
      lastTime = time;
    }
    animId = requestAnimationFrame(animate);
  }

  initGlider();
  draw();

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;

    if (action === "start" && animId === null) {
      animId = requestAnimationFrame(animate);
    } else if (action === "stop" && animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    } else if (action === "step") {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      demo.step(W, H);
      draw();
    } else if (action === "reset") {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      initGlider();
      draw();
    }
  });
}

function renderCRC32(container: HTMLElement, demo: CRC32Demo) {
  container.innerHTML = `
    <div class="demo-crc32">
      <input type="text" class="demo-input" placeholder="Type text to compute CRC32..." value="123456789" data-id="crc-input" />
      <div class="demo-result" data-id="crc-result"></div>
    </div>
  `;

  const input = container.querySelector(
    '[data-id="crc-input"]',
  ) as HTMLInputElement;
  const result = container.querySelector(
    '[data-id="crc-result"]',
  ) as HTMLElement;

  function update() {
    const data = new TextEncoder().encode(input.value);
    const crc = demo.compute(data);
    result.textContent = `CRC32: 0x${crc.toString(16).toUpperCase().padStart(8, "0")}`;
  }

  input.addEventListener("input", update);
  update();
}

function renderParticles(container: HTMLElement, demo: ParticlesDemo) {
  const W = 300;
  const H = 200;
  const N = 80;

  container.innerHTML = `
    <canvas class="demo-canvas" width="${W}" height="${H}" data-id="particles"></canvas>
    <div class="demo-controls">
      <button data-action="start">Start</button>
      <button data-action="stop">Stop</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const canvas = container.querySelector(
    '[data-id="particles"]',
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let animId: number | null = null;

  function initParticles() {
    for (let i = 0; i < N; i++) {
      demo.setParticle(
        i,
        Math.random() * W,
        Math.random() * H,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
      );
    }
  }

  function draw() {
    ctx.fillStyle = "rgba(10, 10, 15, 0.3)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#58a6ff";
    for (let i = 0; i < N; i++) {
      const { x, y } = demo.getParticle(i);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate() {
    demo.applyGravity(N, 0, 20);
    demo.step(N, 0.016);
    demo.bounce(N, W, H);
    draw();
    animId = requestAnimationFrame(animate);
  }

  initParticles();
  draw();
  animId = requestAnimationFrame(animate);

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;

    if (action === "start" && animId === null) {
      animId = requestAnimationFrame(animate);
    } else if (action === "stop" && animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    } else if (action === "reset") {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      initParticles();
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, W, H);
      draw();
      animId = requestAnimationFrame(animate);
    }
  });
}
