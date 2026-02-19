import { describe, test, expect } from "vitest";
import { grayscale } from "../realworld/grayscale";
import { crc32 } from "../realworld/crc32";
import { gameOfLife } from "../realworld/game-of-life";
import { particles } from "../realworld/particles";

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
          255, 0, 0, 255, // red
          0, 255, 0, 255, // green
          0, 0, 255, 255, // blue
          128, 128, 128, 255, // gray
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
});
