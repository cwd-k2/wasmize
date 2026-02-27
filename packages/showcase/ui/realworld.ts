import {
  runRealworldDemos,
  type GrayscaleDemo,
  type SepiaDemo,
  type HistogramEqualizationDemo,
  type ConvolutionDemo,
  type GameOfLifeDemo,
  type CRC32Demo,
  type ErodeDilateDemo,
  type HistogramDemo,
  type MazeBfsDemo,
  type ParticlesDemo,
} from "../app/realworld-runner";

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
      <span class="demo-header-right">
        <button class="wat-toggle">WAT</button>
        <span class="demo-size">${demo.wasmSize} bytes</span>
      </span>
    `;
    card.appendChild(header);

    const watSection = document.createElement("div");
    watSection.className = "wat-section";
    watSection.innerHTML = `<pre class="wat-code">${demo.wat}</pre>`;
    card.appendChild(watSection);

    header.querySelector(".wat-toggle")!.addEventListener("click", (e) => {
      e.stopPropagation();
      watSection.classList.toggle("open");
    });

    const body = document.createElement("div");
    body.className = "demo-body";
    card.appendChild(body);

    switch (demo.kind) {
      case "grayscale":
        renderGrayscale(body, demo);
        break;
      case "sepia":
        renderSepia(body, demo);
        break;
      case "histogram-equalization":
        renderHistogramEqualization(body, demo);
        break;
      case "convolution":
        renderConvolution(body, demo);
        break;
      case "game-of-life":
        renderGameOfLife(body, demo);
        break;
      case "crc32":
        renderCRC32(body, demo);
        break;
      case "erode-dilate":
        renderErodeDilate(body, demo);
        break;
      case "histogram":
        renderHistogram(body, demo);
        break;
      case "maze-bfs":
        renderMazeBfs(body, demo);
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

  const originalCanvas = container.querySelector('[data-id="original"]') as HTMLCanvasElement;
  const processedCanvas = container.querySelector('[data-id="processed"]') as HTMLCanvasElement;
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

function renderSepia(container: HTMLElement, demo: SepiaDemo) {
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
      <button data-action="sepia">Sepia</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const originalCanvas = container.querySelector('[data-id="original"]') as HTMLCanvasElement;
  const processedCanvas = container.querySelector('[data-id="processed"]') as HTMLCanvasElement;
  const origCtx = originalCanvas.getContext("2d")!;
  const procCtx = processedCanvas.getContext("2d")!;

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = (x / SIZE) * 255;
      pixels[i + 1] = (y / SIZE) * 255;
      pixels[i + 2] = ((SIZE - x) / SIZE) * 255;
      pixels[i + 3] = 255;
    }
  }

  function drawToCanvas(ctx: CanvasRenderingContext2D, data: Uint8Array, size: number, scale: number) {
    const imageData = ctx.createImageData(size, size);
    imageData.data.set(data);
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
    if (action === "reset") { reset(); return; }
    if (action === "sepia") {
      demo.setPixels(pixels);
      demo.sepia(SIZE * SIZE);
    }
    drawToCanvas(procCtx, demo.getPixels(SIZE * SIZE), SIZE, SCALE);
  });
}

function renderHistogramEqualization(container: HTMLElement, demo: HistogramEqualizationDemo) {
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
        <div class="section-label">Equalized</div>
        <canvas class="demo-canvas" width="${canvasSize}" height="${canvasSize}" data-id="processed"></canvas>
      </div>
    </div>
    <div class="demo-controls">
      <button data-action="equalize">Equalize</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const originalCanvas = container.querySelector('[data-id="original"]') as HTMLCanvasElement;
  const processedCanvas = container.querySelector('[data-id="processed"]') as HTMLCanvasElement;
  const origCtx = originalCanvas.getContext("2d")!;
  const procCtx = processedCanvas.getContext("2d")!;

  // Low-contrast gradient for equalization demo
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const v = 80 + ((x + y) / (SIZE * 2)) * 80;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }

  function drawToCanvas(ctx: CanvasRenderingContext2D, data: Uint8Array, size: number, scale: number) {
    const imageData = ctx.createImageData(size, size);
    imageData.data.set(data);
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
    if (action === "reset") { reset(); return; }
    if (action === "equalize") {
      demo.setPixels(pixels);
      demo.equalize(SIZE * SIZE);
    }
    drawToCanvas(procCtx, demo.getPixels(SIZE * SIZE), SIZE, SCALE);
  });
}

function renderConvolution(container: HTMLElement, demo: ConvolutionDemo) {
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
        <div class="section-label">Convolved</div>
        <canvas class="demo-canvas" width="${canvasSize}" height="${canvasSize}" data-id="processed"></canvas>
      </div>
    </div>
    <div class="demo-controls">
      <button data-action="blur">Blur</button>
      <button data-action="sharpen">Sharpen</button>
      <button data-action="edge">Edge</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const originalCanvas = container.querySelector('[data-id="original"]') as HTMLCanvasElement;
  const processedCanvas = container.querySelector('[data-id="processed"]') as HTMLCanvasElement;
  const origCtx = originalCanvas.getContext("2d")!;
  const procCtx = processedCanvas.getContext("2d")!;

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = (x / SIZE) * 255;
      pixels[i + 1] = (y / SIZE) * 255;
      pixels[i + 2] = ((SIZE - x) / SIZE) * 255;
      pixels[i + 3] = 255;
    }
  }

  const divisors: Record<string, number> = { blur: 9, sharpen: 1, edge: 1 };

  function drawToCanvas(ctx: CanvasRenderingContext2D, data: Uint8Array, size: number, scale: number) {
    const imageData = ctx.createImageData(size, size);
    imageData.data.set(data);
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    tmp.getContext("2d")!.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, size * scale, size * scale);
  }

  function reset() {
    drawToCanvas(origCtx, pixels, SIZE, SCALE);
    drawToCanvas(procCtx, pixels, SIZE, SCALE);
  }

  reset();

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;
    if (action === "reset") { reset(); return; }
    const kernel = action as "blur" | "sharpen" | "edge";
    const variant = demo.variants[kernel];
    variant.setPixels(pixels);
    variant.convolve(SIZE, SIZE, divisors[kernel]!);
    drawToCanvas(procCtx, variant.getOutput(SIZE, SIZE), SIZE, SCALE);
  });
}

function renderErodeDilate(container: HTMLElement, demo: ErodeDilateDemo) {
  const W = 16;
  const H = 16;
  const CELL = 12;

  container.innerHTML = `
    <canvas class="demo-canvas" width="${W * CELL}" height="${H * CELL}" data-id="morphology"></canvas>
    <div class="demo-controls">
      <button data-action="erode">Erode</button>
      <button data-action="dilate">Dilate</button>
      <button data-action="reset">Reset</button>
    </div>
  `;

  const canvas = container.querySelector('[data-id="morphology"]') as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  let grid = new Array(W * H).fill(0);

  function initGrid() {
    grid = new Array(W * H).fill(0);
    // Draw a cross pattern
    for (let i = 4; i < 12; i++) {
      grid[7 * W + i] = 1;
      grid[8 * W + i] = 1;
      grid[i * W + 7] = 1;
      grid[i * W + 8] = 1;
    }
  }

  function draw() {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W * CELL, H * CELL);
    ctx.fillStyle = "#7ee787";
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y * W + x]) {
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }
  }

  initGrid();
  draw();

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;

    if (action === "reset") {
      initGrid();
      draw();
      return;
    }

    demo.setGrid(grid);
    if (action === "erode") {
      demo.erode(W, H);
    } else if (action === "dilate") {
      demo.dilate(W, H);
    }
    grid = demo.getOutput(W, H);
    draw();
  });
}

function renderHistogram(container: HTMLElement, demo: HistogramDemo) {
  const SIZE = 16;
  const BAR_W = 300;
  const BAR_H = 150;

  container.innerHTML = `
    <canvas class="demo-canvas" width="${BAR_W}" height="${BAR_H}" data-id="histogram-chart"></canvas>
    <div class="demo-controls">
      <button data-action="compute">Compute Histogram</button>
    </div>
  `;

  const canvas = container.querySelector('[data-id="histogram-chart"]') as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  // Generate RGBA gradient as sample data
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      pixels[i] = (x / SIZE) * 255;
      pixels[i + 1] = (y / SIZE) * 255;
      pixels[i + 2] = ((SIZE - x) / SIZE) * 255;
      pixels[i + 3] = 255;
    }
  }

  function drawHistogram() {
    demo.setRgbaData(pixels);
    demo.histogramRgba(SIZE * SIZE);

    // Find max bucket for scaling
    let maxVal = 0;
    for (let i = 0; i < 256; i++) {
      const v = demo.getBucket(i);
      if (v > maxVal) maxVal = v;
    }

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, BAR_W, BAR_H);

    if (maxVal === 0) return;

    const barWidth = BAR_W / 256;
    ctx.fillStyle = "#58a6ff";
    for (let i = 0; i < 256; i++) {
      const v = demo.getBucket(i);
      const barH = (v / maxVal) * (BAR_H - 10);
      ctx.fillRect(i * barWidth, BAR_H - barH, Math.max(barWidth - 0.5, 0.5), barH);
    }
  }

  // Initial empty chart
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, BAR_W, BAR_H);
  ctx.fillStyle = "#666";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Click 'Compute Histogram' to generate", BAR_W / 2, BAR_H / 2);

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (action === "compute") drawHistogram();
  });
}

function renderMazeBfs(container: HTMLElement, demo: MazeBfsDemo) {
  const W = 15;
  const H = 15;
  const CELL = 12;

  container.innerHTML = `
    <canvas class="demo-canvas" width="${W * CELL}" height="${H * CELL}" data-id="maze"></canvas>
    <div class="demo-controls">
      <button data-action="solve">Solve</button>
      <button data-action="reset">Reset</button>
    </div>
    <div class="demo-result" data-id="maze-result"></div>
  `;

  const canvas = container.querySelector('[data-id="maze"]') as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const result = container.querySelector('[data-id="maze-result"]') as HTMLElement;

  let grid = new Array(W * H).fill(0);
  const sx = 0, sy = 0, gx = W - 1, gy = H - 1;

  function initMaze() {
    grid = new Array(W * H).fill(0);
    // Create walls in a simple pattern
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y % 2 === 0 && x > 0 && x < W - 1 && x % 3 === 0) {
          grid[y * W + x] = 1;
        }
        if (y > 0 && y < H - 1 && y % 3 === 0 && x % 2 === 0) {
          grid[y * W + x] = 1;
        }
      }
    }
    // Ensure start and goal are passages
    grid[sy * W + sx] = 0;
    grid[gy * W + gx] = 0;
    result.textContent = "";
  }

  function draw() {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W * CELL, H * CELL);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y * W + x]) {
          ctx.fillStyle = "#444";
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }

    // Start
    ctx.fillStyle = "#3fb950";
    ctx.fillRect(sx * CELL + 2, sy * CELL + 2, CELL - 4, CELL - 4);
    // Goal
    ctx.fillStyle = "#f85149";
    ctx.fillRect(gx * CELL + 2, gy * CELL + 2, CELL - 4, CELL - 4);
  }

  // Toggle walls on click
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL);
    const y = Math.floor((e.clientY - rect.top) / CELL);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    if (x === sx && y === sy) return;
    if (x === gx && y === gy) return;
    grid[y * W + x] = grid[y * W + x] ? 0 : 1;
    draw();
  });

  initMaze();
  draw();

  container.querySelector(".demo-controls")!.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).dataset.action;
    if (!action) return;

    if (action === "reset") {
      initMaze();
      draw();
      return;
    }

    if (action === "solve") {
      demo.setMaze(grid);
      const dist = demo.solve(W, H, sx, sy, gx, gy);
      result.textContent = dist >= 0 ? `Shortest path: ${dist} steps` : "No path found";
    }
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

  const canvas = container.querySelector('[data-id="life"]') as HTMLCanvasElement;
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

  const input = container.querySelector('[data-id="crc-input"]') as HTMLInputElement;
  const result = container.querySelector('[data-id="crc-result"]') as HTMLElement;

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

  const canvas = container.querySelector('[data-id="particles"]') as HTMLCanvasElement;
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
