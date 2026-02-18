import { describe, test, expect } from "vitest";
import { problem8_matmul } from "../matmul";

describe("Matrix Multiply", () => {
  test("2x2 identity * A = A", async () => {
    const wasm = problem8_matmul();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const matmul = instance.exports.matmul as (n: number) => number;

    const n = 2;
    const nn = n * n;
    // A = [[1,2],[3,4]]
    mem[0] = 1; mem[1] = 2; mem[2] = 3; mem[3] = 4;
    // B = identity [[1,0],[0,1]]
    mem[nn + 0] = 1; mem[nn + 1] = 0; mem[nn + 2] = 0; mem[nn + 3] = 1;

    const c00 = matmul(n);
    expect(c00).toBe(1); // C[0][0] = 1*1 + 2*0 = 1
    // Verify full C matrix
    expect(mem[2 * nn + 0]).toBe(1);
    expect(mem[2 * nn + 1]).toBe(2);
    expect(mem[2 * nn + 2]).toBe(3);
    expect(mem[2 * nn + 3]).toBe(4);
  });

  test("3x3 multiplication", async () => {
    const wasm = problem8_matmul();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const matmul = instance.exports.matmul as (n: number) => number;

    const n = 3;
    const nn = n * n;
    // A = [[1,2,3],[4,5,6],[7,8,9]]
    const A = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // B = [[9,8,7],[6,5,4],[3,2,1]]
    const B = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    A.forEach((v, i) => { mem[i] = v; });
    B.forEach((v, i) => { mem[nn + i] = v; });

    const c00 = matmul(n);
    // C[0][0] = 1*9 + 2*6 + 3*3 = 9+12+9 = 30
    expect(c00).toBe(30);
    // C[1][1] = 4*8 + 5*5 + 6*2 = 32+25+12 = 69
    expect(mem[2 * nn + 4]).toBe(69);
  });
});
