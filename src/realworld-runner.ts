import { grayscale } from "../examples/realworld/grayscale";
import { crc32 } from "../examples/realworld/crc32";
import { gameOfLife } from "../examples/realworld/game-of-life";
import { particles } from "../examples/realworld/particles";

export interface GrayscaleDemo {
  kind: "grayscale";
  title: string;
  wasmSize: number;
  grayscale: (len: number) => void;
  brightness: (len: number, delta: number) => void;
  setPixels: (data: Uint8Array) => void;
  getPixels: (n: number) => Uint8Array;
}

export interface GameOfLifeDemo {
  kind: "game-of-life";
  title: string;
  wasmSize: number;
  step: (w: number, h: number) => void;
  getCell: (x: number, y: number, w: number) => number;
  setGrid: (cells: number[]) => void;
  getGrid: (w: number, h: number) => number[];
}

export interface CRC32Demo {
  kind: "crc32";
  title: string;
  wasmSize: number;
  compute: (data: Uint8Array) => number;
}

export interface ParticlesDemo {
  kind: "particles";
  title: string;
  wasmSize: number;
  step: (n: number, dt: number) => void;
  applyGravity: (n: number, gx: number, gy: number) => void;
  bounce: (n: number, w: number, h: number) => void;
  setParticle: (
    i: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) => void;
  getParticle: (
    i: number,
  ) => { x: number; y: number; vx: number; vy: number };
}

export type RealworldDemo =
  | GrayscaleDemo
  | GameOfLifeDemo
  | CRC32Demo
  | ParticlesDemo;

export async function runRealworldDemos(): Promise<RealworldDemo[]> {
  const [g, c, gol, p] = await Promise.all([
    grayscale(),
    crc32(),
    gameOfLife(),
    particles(),
  ]);

  return [
    {
      kind: "grayscale",
      title: "Image Grayscale + Brightness",
      wasmSize: g.binary.length,
      grayscale: g.grayscale,
      brightness: g.brightness,
      setPixels: g.setPixels,
      getPixels: g.getPixels,
    },
    {
      kind: "game-of-life",
      title: "Conway's Game of Life",
      wasmSize: gol.binary.length,
      step: gol.step,
      getCell: gol.getCell,
      setGrid: gol.setGrid,
      getGrid: gol.getGrid,
    },
    {
      kind: "crc32",
      title: "CRC32 Checksum",
      wasmSize: c.binary.length,
      compute: c.compute,
    },
    {
      kind: "particles",
      title: "2D Particle Simulation",
      wasmSize: p.binary.length,
      step: p.step,
      applyGravity: p.applyGravity,
      bounce: p.bounce,
      setParticle: p.setParticle,
      getParticle: p.getParticle,
    },
  ];
}
