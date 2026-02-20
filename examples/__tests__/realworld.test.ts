import { describe, test, expect } from "vitest";
import { grayscale } from "../realworld/grayscale";
import { crc32 } from "../realworld/crc32";
import { gameOfLife } from "../realworld/game-of-life";
import { particles } from "../realworld/particles";
import { convolution } from "../realworld/convolution";
import { sepia } from "../realworld/sepia";
import { histogram } from "../realworld/histogram";
import { erodeDilate } from "../realworld/erode-dilate";
import { mazeBfs } from "../realworld/maze-bfs";
import { histogramEqualization } from "../realworld/histogram-equalization";

describe("Realworld examples", () => {
  describe("Grayscale", () => {
    test("white pixel stays white", async () => {
      const g = await grayscale();
      g.setPixels(new Uint8Array([255, 255, 255, 255]));
      g.grayscale(1);
      const px = g.getPixels(1);
      expect(px[0]).toBe(255);
      expect(px[1]).toBe(255);
      expect(px[2]).toBe(255);
      expect(px[3]).toBe(255); // alpha unchanged
    });

    test("red pixel → gray ≈ 76", async () => {
      const g = await grayscale();
      g.setPixels(new Uint8Array([255, 0, 0, 255]));
      g.grayscale(1);
      const px = g.getPixels(1);
      // (77*255 + 150*0 + 29*0) >> 8 = 19635 >> 8 = 76
      expect(px[0]).toBe(76);
      expect(px[1]).toBe(76);
      expect(px[2]).toBe(76);
    });

    test("multiple pixels (R, G, B, gray)", async () => {
      const g = await grayscale();
      g.setPixels(
        new Uint8Array([
          255,
          0,
          0,
          255, // red
          0,
          255,
          0,
          255, // green
          0,
          0,
          255,
          255, // blue
          128,
          128,
          128,
          255, // gray
        ]),
      );
      g.grayscale(4);
      const px = g.getPixels(4);
      expect(px[0]).toBe(76); // red → 76
      expect(px[4]).toBe(149); // green → 149
      expect(px[8]).toBe(28); // blue → 28
      expect(px[12]).toBe(128); // gray stays 128
    });

    test("brightness +100 clamps at 255", async () => {
      const g = await grayscale();
      g.setPixels(new Uint8Array([200, 200, 200, 255]));
      g.brightness(1, 100);
      const px = g.getPixels(1);
      expect(px[0]).toBe(255);
      expect(px[1]).toBe(255);
      expect(px[2]).toBe(255);
    });

    test("brightness -100 clamps at 0", async () => {
      const g = await grayscale();
      g.setPixels(new Uint8Array([50, 50, 50, 255]));
      g.brightness(1, -100);
      const px = g.getPixels(1);
      expect(px[0]).toBe(0);
      expect(px[1]).toBe(0);
      expect(px[2]).toBe(0);
    });
  });

  describe("CRC32", () => {
    test("empty input → 0x00000000", async () => {
      const c = await crc32();
      expect(c.compute(new Uint8Array([]))).toBe(0x00000000);
    });

    test('"123456789" → 0xCBF43926 (standard test vector)', async () => {
      const c = await crc32();
      const data = new TextEncoder().encode("123456789");
      expect(c.compute(data)).toBe(0xcbf43926);
    });

    test('"test" → 0xD87F7E0C', async () => {
      const c = await crc32();
      const data = new TextEncoder().encode("test");
      expect(c.compute(data)).toBe(0xd87f7e0c);
    });

    test("single byte 0x00", async () => {
      const c = await crc32();
      expect(c.compute(new Uint8Array([0x00]))).toBe(0xd202ef8d);
    });
  });

  describe("Game of Life", () => {
    test("block (2x2) is stable", async () => {
      const g = await gameOfLife();
      // 4x4 grid with 2x2 block at (1,1)
      // prettier-ignore
      g.setGrid([
        0,0,0,0,
        0,1,1,0,
        0,1,1,0,
        0,0,0,0,
      ]);
      g.step(4, 4);
      // prettier-ignore
      expect(g.getGrid(4, 4)).toEqual([
        0,0,0,0,
        0,1,1,0,
        0,1,1,0,
        0,0,0,0,
      ]);
    });

    test("blinker oscillates", async () => {
      const g = await gameOfLife();
      // 5x5 grid with horizontal blinker at row 2
      // prettier-ignore
      g.setGrid([
        0,0,0,0,0,
        0,0,0,0,0,
        0,1,1,1,0,
        0,0,0,0,0,
        0,0,0,0,0,
      ]);
      g.step(5, 5);
      // Should become vertical
      expect(g.getCell(2, 1, 5)).toBe(1);
      expect(g.getCell(2, 2, 5)).toBe(1);
      expect(g.getCell(2, 3, 5)).toBe(1);
      expect(g.getCell(1, 2, 5)).toBe(0);
      expect(g.getCell(3, 2, 5)).toBe(0);
    });

    test("isolated cell dies", async () => {
      const g = await gameOfLife();
      // prettier-ignore
      g.setGrid([
        0,0,0,
        0,1,0,
        0,0,0,
      ]);
      g.step(3, 3);
      expect(g.getCell(1, 1, 3)).toBe(0);
    });

    test("getCell reads correct positions", async () => {
      const g = await gameOfLife();
      // prettier-ignore
      g.setGrid([
        1,0,
        0,1,
      ]);
      expect(g.getCell(0, 0, 2)).toBe(1);
      expect(g.getCell(1, 0, 2)).toBe(0);
      expect(g.getCell(0, 1, 2)).toBe(0);
      expect(g.getCell(1, 1, 2)).toBe(1);
    });
  });

  describe("Convolution", () => {
    test("identity kernel (center=1, rest=0) preserves interior pixel", async () => {
      const c = await convolution("blur");
      // We use a custom kernel test via blur with divisor
      // 3x3 image: all channels = 100, alpha = 255
      const w = 3,
        h = 3;
      const pixels = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        pixels[i * 4] = 100;
        pixels[i * 4 + 1] = 100;
        pixels[i * 4 + 2] = 100;
        pixels[i * 4 + 3] = 255;
      }
      c.setPixels(pixels);
      c.convolve(w, h, 9); // blur kernel [1,1,1,...]/9
      const out = c.getOutput(w, h);
      // Center pixel (1,1) is average of all 9 neighbors, all 100 → 100
      const idx = (1 * w + 1) * 4;
      expect(out[idx]).toBe(100);
      expect(out[idx + 1]).toBe(100);
      expect(out[idx + 2]).toBe(100);
      expect(out[idx + 3]).toBe(255); // alpha preserved
    });

    test("blur averages surrounding pixels", async () => {
      const c = await convolution("blur");
      // 3x3: center pixel bright, rest dark
      const w = 3,
        h = 3;
      const pixels = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        pixels[i * 4 + 3] = 255;
      }
      pixels[(1 * w + 1) * 4] = 255; // center R = 255
      c.setPixels(pixels);
      c.convolve(w, h, 9);
      const out = c.getOutput(w, h);
      // center = (0*8 + 255*1) / 9 = 28
      expect(out[(1 * w + 1) * 4]).toBe(28);
    });

    test("sharpen amplifies center", async () => {
      const c = await convolution("sharpen");
      const w = 3,
        h = 3;
      const pixels = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        pixels[i * 4] = 100;
        pixels[i * 4 + 1] = 100;
        pixels[i * 4 + 2] = 100;
        pixels[i * 4 + 3] = 255;
      }
      c.setPixels(pixels);
      c.convolve(w, h, 1);
      const out = c.getOutput(w, h);
      // Uniform input: sharpen kernel sums to 1, so output = input
      const idx = (1 * w + 1) * 4;
      expect(out[idx]).toBe(100);
    });
  });

  describe("Sepia", () => {
    test("black pixel stays black", async () => {
      const s = await sepia();
      s.setPixels(new Uint8Array([0, 0, 0, 255]));
      s.sepia(1);
      const px = s.getPixels(1);
      expect(px[0]).toBe(0);
      expect(px[1]).toBe(0);
      expect(px[2]).toBe(0);
      expect(px[3]).toBe(255);
    });

    test("white pixel → sepia tone", async () => {
      const s = await sepia();
      s.setPixels(new Uint8Array([255, 255, 255, 255]));
      s.sepia(1);
      const px = s.getPixels(1);
      // R = (101+197+48)*255/256 = 346*255/256 ≈ 344 → clamp 255
      expect(px[0]).toBe(255);
      // G = (89+176+43)*255/256 = 308*255/256 ≈ 306 → clamp 255
      expect(px[1]).toBe(255);
      // B = (70+137+34)*255/256 = 241*255>>8 = 61455>>8 = 240
      expect(px[2]).toBe(240);
    });

    test("pure red → sepia values", async () => {
      const s = await sepia();
      s.setPixels(new Uint8Array([255, 0, 0, 255]));
      s.sepia(1);
      const px = s.getPixels(1);
      // R = 101*255 >> 8 = 25755 >> 8 = 100
      expect(px[0]).toBe(100);
      // G = 89*255 >> 8 = 22695 >> 8 = 88
      expect(px[1]).toBe(88);
      // B = 70*255 >> 8 = 17850 >> 8 = 69
      expect(px[2]).toBe(69);
    });

    test("alpha unchanged", async () => {
      const s = await sepia();
      s.setPixels(new Uint8Array([100, 150, 200, 128]));
      s.sepia(1);
      const px = s.getPixels(1);
      expect(px[3]).toBe(128);
    });
  });

  describe("Histogram", () => {
    test("single value histogram", async () => {
      const h = await histogram();
      h.setGrayscaleData(new Uint8Array([42, 42, 42, 42, 42]));
      h.histogram(5);
      expect(h.getBucket(42)).toBe(5);
      expect(h.getBucket(0)).toBe(0);
      expect(h.getBucket(255)).toBe(0);
    });

    test("distributed values", async () => {
      const h = await histogram();
      h.setGrayscaleData(new Uint8Array([0, 0, 1, 1, 1, 255]));
      h.histogram(6);
      expect(h.getBucket(0)).toBe(2);
      expect(h.getBucket(1)).toBe(3);
      expect(h.getBucket(255)).toBe(1);
      expect(h.getBucket(128)).toBe(0);
    });

    test("CDF is monotonically increasing prefix sum", async () => {
      const h = await histogram();
      h.setGrayscaleData(new Uint8Array([0, 1, 1, 2, 2, 2]));
      h.histogram(6);
      h.cdf();
      expect(h.getCdf(0)).toBe(1); // 1
      expect(h.getCdf(1)).toBe(3); // 1 + 2
      expect(h.getCdf(2)).toBe(6); // 1 + 2 + 3
      expect(h.getCdf(255)).toBe(6); // total
    });

    test("RGBA histogram uses BT.601 grayscale", async () => {
      const h = await histogram();
      // Pure red pixel: (77*255 + 150*0 + 29*0) >> 8 = 76
      h.setRgbaData(new Uint8Array([255, 0, 0, 255]));
      h.histogramRgba(1);
      expect(h.getBucket(76)).toBe(1);
    });
  });

  describe("Particles", () => {
    test("step updates position (dt=0.5)", async () => {
      const p = await particles();
      p.setParticle(0, 10, 20, 4, -6);
      p.step(1, 0.5);
      const { x, y } = p.getParticle(0);
      expect(x).toBeCloseTo(12); // 10 + 4*0.5
      expect(y).toBeCloseTo(17); // 20 + (-6)*0.5
    });

    test("applyGravity changes velocity", async () => {
      const p = await particles();
      p.setParticle(0, 0, 0, 1, 2);
      p.applyGravity(1, 0, 9.8);
      const { vx, vy } = p.getParticle(0);
      expect(vx).toBeCloseTo(1);
      expect(vy).toBeCloseTo(11.8);
    });

    test("bounce reflects off left wall", async () => {
      const p = await particles();
      p.setParticle(0, -5, 50, -10, 0);
      p.bounce(1, 100, 100);
      const { x, vx } = p.getParticle(0);
      expect(x).toBeCloseTo(5); // reflected
      expect(vx).toBeCloseTo(10); // velocity reversed
    });

    test("bounce reflects off right wall", async () => {
      const p = await particles();
      p.setParticle(0, 105, 50, 10, 0);
      p.bounce(1, 100, 100);
      const { x, vx } = p.getParticle(0);
      expect(x).toBeCloseTo(95); // 2*100 - 105 = 95
      expect(vx).toBeCloseTo(-10);
    });

    test("multiple particles are independent", async () => {
      const p = await particles();
      p.setParticle(0, 10, 10, 1, 0);
      p.setParticle(1, 50, 50, 0, 1);
      p.step(2, 1.0);
      const p0 = p.getParticle(0);
      const p1 = p.getParticle(1);
      expect(p0.x).toBeCloseTo(11);
      expect(p0.y).toBeCloseTo(10);
      expect(p1.x).toBeCloseTo(50);
      expect(p1.y).toBeCloseTo(51);
    });
  });

  describe("Erode/Dilate", () => {
    test("erode: isolated pixel removed", async () => {
      const ed = await erodeDilate();
      // 5x5 grid with single pixel at center
      // prettier-ignore
      ed.setGrid([
        0,0,0,0,0,
        0,0,0,0,0,
        0,0,1,0,0,
        0,0,0,0,0,
        0,0,0,0,0,
      ]);
      ed.erode(5, 5);
      const out = ed.getOutput(5, 5);
      // Center should be 0 (not all neighbors are 1)
      expect(out[2 * 5 + 2]).toBe(0);
    });

    test("erode: solid 3x3 block preserves center", async () => {
      const ed = await erodeDilate();
      // 5x5 grid with 3x3 block
      // prettier-ignore
      ed.setGrid([
        0,0,0,0,0,
        0,1,1,1,0,
        0,1,1,1,0,
        0,1,1,1,0,
        0,0,0,0,0,
      ]);
      ed.erode(5, 5);
      const out = ed.getOutput(5, 5);
      // Center of 3x3 block should survive (all 9 neighbors are 1)
      expect(out[2 * 5 + 2]).toBe(1);
      // Edges of block should be eroded
      expect(out[1 * 5 + 1]).toBe(0);
    });

    test("dilate: isolated pixel expands", async () => {
      const ed = await erodeDilate();
      // 5x5 grid with single pixel
      // prettier-ignore
      ed.setGrid([
        0,0,0,0,0,
        0,0,0,0,0,
        0,0,1,0,0,
        0,0,0,0,0,
        0,0,0,0,0,
      ]);
      ed.dilate(5, 5);
      const out = ed.getOutput(5, 5);
      // All 3x3 neighbors of center should become 1
      expect(out[1 * 5 + 1]).toBe(1);
      expect(out[1 * 5 + 2]).toBe(1);
      expect(out[1 * 5 + 3]).toBe(1);
      expect(out[2 * 5 + 1]).toBe(1);
      expect(out[2 * 5 + 2]).toBe(1);
      expect(out[2 * 5 + 3]).toBe(1);
      expect(out[3 * 5 + 1]).toBe(1);
      expect(out[3 * 5 + 2]).toBe(1);
      expect(out[3 * 5 + 3]).toBe(1);
      // Corners should remain 0 (border)
      expect(out[0]).toBe(0);
    });

    test("dilate: all zeros stays zero", async () => {
      const ed = await erodeDilate();
      ed.setGrid(new Array(25).fill(0));
      ed.dilate(5, 5);
      const out = ed.getOutput(5, 5);
      expect(out.every((v) => v === 0)).toBe(true);
    });
  });

  describe("Maze BFS", () => {
    test("straight path", async () => {
      const m = await mazeBfs();
      // 3x3 open grid, start (0,0) → goal (2,2)
      // prettier-ignore
      m.setMaze([
        0,0,0,
        0,0,0,
        0,0,0,
      ]);
      expect(m.solve(3, 3, 0, 0, 2, 2)).toBe(4); // Manhattan distance
    });

    test("start equals goal", async () => {
      const m = await mazeBfs();
      m.setMaze([0, 0, 0, 0]);
      expect(m.solve(2, 2, 0, 0, 0, 0)).toBe(0);
    });

    test("wall blocks path → -1", async () => {
      const m = await mazeBfs();
      // 3x3 with wall blocking all paths
      // prettier-ignore
      m.setMaze([
        0,1,0,
        0,1,0,
        0,1,0,
      ]);
      expect(m.solve(3, 3, 0, 0, 2, 0)).toBe(-1);
    });

    test("maze with detour", async () => {
      const m = await mazeBfs();
      // 5x5 maze: wall forces a detour
      // prettier-ignore
      m.setMaze([
        0,0,0,0,0,
        1,1,1,1,0,
        0,0,0,0,0,
        0,1,1,1,1,
        0,0,0,0,0,
      ]);
      // Start (0,0) → Goal (4,4): path goes right, down, left, down, right
      expect(m.solve(5, 5, 0, 0, 4, 4)).toBe(16);
    });
  });

  describe("Histogram Equalization", () => {
    test("uniform image stays roughly the same", async () => {
      const he = await histogramEqualization();
      // 4 pixels, all same color → equalization should output near-uniform
      const data = new Uint8Array([
        100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255, 100, 100, 100, 255,
      ]);
      he.setPixels(data);
      he.equalize(4);
      const px = he.getPixels(4);
      // All pixels had same gray; CDF has single step, so remap = 0 (or close)
      // With only one bucket value, (cdf - cdfMin) / (total - cdfMin) = 0/0 → clamped
      // All pixels get the same value
      expect(px[0]).toBe(px[4]);
      expect(px[0]).toBe(px[8]);
      expect(px[3]).toBe(255); // alpha unchanged
    });

    test("low-contrast pixels get spread out", async () => {
      const he = await histogramEqualization();
      // 3 distinct gray levels: dark, medium, bright
      const data = new Uint8Array([
        50,
        50,
        50,
        255, // dark gray
        128,
        128,
        128,
        255, // medium gray
        200,
        200,
        200,
        255, // bright gray
      ]);
      he.setPixels(data);
      he.equalize(3);
      const px = he.getPixels(3);
      // After equalization, the values should be more spread out
      // Darkest pixel should map lower, brightest higher
      expect(px[0]).toBeLessThan(px[4]);
      expect(px[4]).toBeLessThan(px[8]);
    });

    test("alpha channel preserved", async () => {
      const he = await histogramEqualization();
      const data = new Uint8Array([100, 50, 200, 128, 50, 150, 100, 64]);
      he.setPixels(data);
      he.equalize(2);
      const px = he.getPixels(2);
      expect(px[3]).toBe(128);
      expect(px[7]).toBe(64);
    });

    test("black and white image", async () => {
      const he = await histogramEqualization();
      const data = new Uint8Array([
        0,
        0,
        0,
        255, // black
        255,
        255,
        255,
        255, // white
      ]);
      he.setPixels(data);
      he.equalize(2);
      const px = he.getPixels(2);
      // Black should stay 0, white should stay 255
      expect(px[0]).toBe(0);
      expect(px[4]).toBe(255);
    });
  });
});
