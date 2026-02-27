import { grayscale } from "../examples/realworld/grayscale";
import { sepia } from "../examples/realworld/sepia";
import { histogramEqualization } from "../examples/realworld/histogram-equalization";
import { convolution } from "../examples/realworld/convolution";
import { crc32 } from "../examples/realworld/crc32";
import { gameOfLife } from "../examples/realworld/game-of-life";
import { erodeDilate } from "../examples/realworld/erode-dilate";
import { histogram } from "../examples/realworld/histogram";
import { mazeBfs } from "../examples/realworld/maze-bfs";
import { particles } from "../examples/realworld/particles";

export interface GrayscaleDemo {
  kind: "grayscale";
  title: string;
  wasmSize: number;
  wat: string;
  grayscale: (len: number) => void;
  brightness: (len: number, delta: number) => void;
  setPixels: (data: Uint8Array) => void;
  getPixels: (n: number) => Uint8Array;
}

export interface GameOfLifeDemo {
  kind: "game-of-life";
  title: string;
  wasmSize: number;
  wat: string;
  step: (w: number, h: number) => void;
  getCell: (x: number, y: number, w: number) => number;
  setGrid: (cells: number[]) => void;
  getGrid: (w: number, h: number) => number[];
}

export interface CRC32Demo {
  kind: "crc32";
  title: string;
  wasmSize: number;
  wat: string;
  compute: (data: Uint8Array) => number;
}

export interface SepiaDemo {
  kind: "sepia";
  title: string;
  wasmSize: number;
  wat: string;
  sepia: (len: number) => void;
  setPixels: (data: Uint8Array) => void;
  getPixels: (n: number) => Uint8Array;
}

export interface HistogramEqualizationDemo {
  kind: "histogram-equalization";
  title: string;
  wasmSize: number;
  wat: string;
  equalize: (len: number) => void;
  setPixels: (data: Uint8Array) => void;
  getPixels: (n: number) => Uint8Array;
}

export interface ConvolutionVariant {
  convolve: (w: number, h: number, divisor: number) => void;
  setPixels: (data: Uint8Array) => void;
  getOutput: (w: number, h: number) => Uint8Array;
}

export interface ConvolutionDemo {
  kind: "convolution";
  title: string;
  wasmSize: number;
  wat: string;
  variants: Record<"blur" | "sharpen" | "edge", ConvolutionVariant>;
}

export interface ErodeDilateDemo {
  kind: "erode-dilate";
  title: string;
  wasmSize: number;
  wat: string;
  erode: (w: number, h: number) => void;
  dilate: (w: number, h: number) => void;
  setGrid: (data: number[]) => void;
  getOutput: (w: number, h: number) => number[];
}

export interface HistogramDemo {
  kind: "histogram";
  title: string;
  wasmSize: number;
  wat: string;
  histogramRgba: (len: number) => void;
  getBucket: (value: number) => number;
  setRgbaData: (data: Uint8Array) => void;
}

export interface MazeBfsDemo {
  kind: "maze-bfs";
  title: string;
  wasmSize: number;
  wat: string;
  solve: (w: number, h: number, sx: number, sy: number, gx: number, gy: number) => number;
  setMaze: (grid: number[]) => void;
}

export interface ParticlesDemo {
  kind: "particles";
  title: string;
  wasmSize: number;
  wat: string;
  step: (n: number, dt: number) => void;
  applyGravity: (n: number, gx: number, gy: number) => void;
  bounce: (n: number, w: number, h: number) => void;
  setParticle: (i: number, x: number, y: number, vx: number, vy: number) => void;
  getParticle: (i: number) => { x: number; y: number; vx: number; vy: number };
}

export type RealworldDemo =
  | GrayscaleDemo
  | SepiaDemo
  | HistogramEqualizationDemo
  | ConvolutionDemo
  | GameOfLifeDemo
  | CRC32Demo
  | ErodeDilateDemo
  | HistogramDemo
  | MazeBfsDemo
  | ParticlesDemo;

export async function runRealworldDemos(): Promise<RealworldDemo[]> {
  const [g, sep, heq, convBlur, convSharpen, convEdge, c, gol, ed, hist, mb, p] =
    await Promise.all([
      grayscale(),
      sepia(),
      histogramEqualization(),
      convolution("blur"),
      convolution("sharpen"),
      convolution("edge"),
      crc32(),
      gameOfLife(),
      erodeDilate(),
      histogram(),
      mazeBfs(),
      particles(),
    ]);

  return [
    {
      kind: "grayscale",
      title: "Image Grayscale + Brightness",
      wasmSize: g.binary.length,
      wat: g.binary.wat,
      grayscale: g.grayscale,
      brightness: g.brightness,
      setPixels: g.setPixels,
      getPixels: g.getPixels,
    },
    {
      kind: "sepia",
      title: "Sepia Tone Filter",
      wasmSize: sep.binary.length,
      wat: sep.binary.wat,
      sepia: sep.sepia,
      setPixels: sep.setPixels,
      getPixels: sep.getPixels,
    },
    {
      kind: "histogram-equalization",
      title: "Histogram Equalization",
      wasmSize: heq.binary.length,
      wat: heq.binary.wat,
      equalize: heq.equalize,
      setPixels: heq.setPixels,
      getPixels: heq.getPixels,
    },
    {
      kind: "convolution",
      title: "3×3 Convolution (Blur / Sharpen / Edge)",
      wasmSize: convBlur.binary.length,
      wat: convBlur.binary.wat,
      variants: {
        blur: { convolve: convBlur.convolve, setPixels: convBlur.setPixels, getOutput: convBlur.getOutput },
        sharpen: { convolve: convSharpen.convolve, setPixels: convSharpen.setPixels, getOutput: convSharpen.getOutput },
        edge: { convolve: convEdge.convolve, setPixels: convEdge.setPixels, getOutput: convEdge.getOutput },
      },
    },
    {
      kind: "game-of-life",
      title: "Conway's Game of Life",
      wasmSize: gol.binary.length,
      wat: gol.binary.wat,
      step: gol.step,
      getCell: gol.getCell,
      setGrid: gol.setGrid,
      getGrid: gol.getGrid,
    },
    {
      kind: "crc32",
      title: "CRC32 Checksum",
      wasmSize: c.binary.length,
      wat: c.binary.wat,
      compute: c.compute,
    },
    {
      kind: "erode-dilate",
      title: "Binary Morphology (Erode / Dilate)",
      wasmSize: ed.binary.length,
      wat: ed.binary.wat,
      erode: ed.erode,
      dilate: ed.dilate,
      setGrid: ed.setGrid,
      getOutput: ed.getOutput,
    },
    {
      kind: "histogram",
      title: "Grayscale Histogram",
      wasmSize: hist.binary.length,
      wat: hist.binary.wat,
      histogramRgba: hist.histogramRgba,
      getBucket: hist.getBucket,
      setRgbaData: hist.setRgbaData,
    },
    {
      kind: "maze-bfs",
      title: "Maze Solver (BFS Shortest Path)",
      wasmSize: mb.binary.length,
      wat: mb.binary.wat,
      solve: mb.solve,
      setMaze: mb.setMaze,
    },
    {
      kind: "particles",
      title: "2D Particle Simulation",
      wasmSize: p.binary.length,
      wat: p.binary.wat,
      step: p.step,
      applyGravity: p.applyGravity,
      bounce: p.bounce,
      setParticle: p.setParticle,
      getParticle: p.getParticle,
    },
  ];
}
