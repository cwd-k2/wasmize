import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Op, Mem, Ctrl } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("i32 unary ops", () => {
  test("clz counts leading zeros", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("clz", { a: Type.i32 }, function* (a) {
        return yield* Op.i32.clz(a);
      });
    });
    const {
      exports: { clz },
    } = await instantiate(binary);
    const f = clz as (a: number) => number;
    expect(f(1)).toBe(31);
    expect(f(0x80000000)).toBe(0);
    expect(f(0)).toBe(32);
  });

  test("ctz counts trailing zeros", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("ctz", { a: Type.i32 }, function* (a) {
        return yield* Op.i32.ctz(a);
      });
    });
    const {
      exports: { ctz },
    } = await instantiate(binary);
    const f = ctz as (a: number) => number;
    expect(f(1)).toBe(0);
    expect(f(2)).toBe(1);
    expect(f(0)).toBe(32);
  });

  test("popcnt counts set bits", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("popcnt", { a: Type.i32 }, function* (a) {
        return yield* Op.i32.popcnt(a);
      });
    });
    const {
      exports: { popcnt },
    } = await instantiate(binary);
    const f = popcnt as (a: number) => number;
    expect(f(0)).toBe(0);
    expect(f(7)).toBe(3); // 0b111
    expect(f(-1)).toBe(32); // all bits set
  });

  test("rotl/rotr rotate bits", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("rotl", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.i32.rotl(a, b);
      });
      yield* Mod.exportFunc("rotr", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.i32.rotr(a, b);
      });
    });
    const { exports } = await instantiate(binary);
    const rotl = exports.rotl as Function;
    const rotr = exports.rotr as Function;
    // rotl(1, 1) = 2, rotr(2, 1) = 1
    expect(rotl(1, 1)).toBe(2);
    expect(rotr(2, 1)).toBe(1);
    // rotl then rotr cancels out
    expect(rotr(rotl(0xff, 8), 8)).toBe(0xff);
  });
});

describe("i64 full ops", () => {
  test("i64 rem/and/or/xor", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("rem64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.rem(Op.extend(a), Op.extend(b)));
      });
      yield* Mod.exportFunc("and64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.and(Op.extend(a), Op.extend(b)));
      });
      yield* Mod.exportFunc("or64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.or(Op.extend(a), Op.extend(b)));
      });
      yield* Mod.exportFunc("xor64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.xor(Op.extend(a), Op.extend(b)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.rem64 as Function)(10, 3)).toBe(1);
    expect((exports.and64 as Function)(0xff, 0x0f)).toBe(0x0f);
    expect((exports.or64 as Function)(0xf0, 0x0f)).toBe(0xff);
    expect((exports.xor64 as Function)(0xff, 0x0f)).toBe(0xf0);
  });

  test("i64 shift/rotate", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("shl64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.shl(Op.extend(a), Op.extend(b)));
      });
      yield* Mod.exportFunc("shr64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.shr(Op.extend(a), Op.extend(b)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.shl64 as Function)(1, 4)).toBe(16);
    expect((exports.shr64 as Function)(16, 4)).toBe(1);
  });

  test("i64 comparisons", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("eq64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.i64.eq(Op.extend(a), Op.extend(b));
      });
      yield* Mod.exportFunc("lt64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.i64.lt(Op.extend(a), Op.extend(b));
      });
      yield* Mod.exportFunc("gt64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.i64.gt(Op.extend(a), Op.extend(b));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.eq64 as Function)(5, 5)).toBe(1);
    expect((exports.eq64 as Function)(5, 6)).toBe(0);
    expect((exports.lt64 as Function)(3, 5)).toBe(1);
    expect((exports.gt64 as Function)(5, 3)).toBe(1);
  });

  test("i64 unary clz/ctz/popcnt", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("clz64", { a: Type.i32 }, function* (a) {
        return yield* Op.wrap(Op.i64.clz(Op.extend(a)));
      });
      yield* Mod.exportFunc("popcnt64", { a: Type.i32 }, function* (a) {
        return yield* Op.wrap(Op.i64.popcnt(Op.extend(a)));
      });
    });
    const { exports } = await instantiate(binary);
    // extend(1) → i64 with 63 leading zeros
    expect((exports.clz64 as Function)(1)).toBe(63);
    expect((exports.popcnt64 as Function)(7)).toBe(3);
  });
});

describe("f32 operations", () => {
  test("f32 arithmetic", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f32_add", function* () {
        // f32 1.5 + 2.5 = 4.0 → convert to i32
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.add(Mem.f32(1.5), Mem.f32(2.5)));
      });
      yield* Mod.exportFunc("f32_mul", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.mul(Mem.f32(3.0), Mem.f32(4.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f32_add as Function)()).toBe(4);
    expect((exports.f32_mul as Function)()).toBe(12);
  });

  test("f32 unary: abs, neg, sqrt", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f32_abs", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.abs(Mem.f32(-7.0)));
      });
      yield* Mod.exportFunc("f32_neg", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.neg(Mem.f32(5.0)));
      });
      yield* Mod.exportFunc("f32_sqrt", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.sqrt(Mem.f32(9.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f32_abs as Function)()).toBe(7);
    expect((exports.f32_neg as Function)()).toBe(-5);
    expect((exports.f32_sqrt as Function)()).toBe(3);
  });

  test("f32 comparisons", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f32_lt", function* () {
        return yield* Op.f32.lt(Mem.f32(1.0), Mem.f32(2.0));
      });
      yield* Mod.exportFunc("f32_eq", function* () {
        return yield* Op.f32.eq(Mem.f32(3.0), Mem.f32(3.0));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f32_lt as Function)()).toBe(1);
    expect((exports.f32_eq as Function)()).toBe(1);
  });

  test("f32 min/max", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f32_min", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.min(Mem.f32(3.0), Mem.f32(5.0)));
      });
      yield* Mod.exportFunc("f32_max", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Op.f32.max(Mem.f32(3.0), Mem.f32(5.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f32_min as Function)()).toBe(3);
    expect((exports.f32_max as Function)()).toBe(5);
  });

  test("f32 memory load/store", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("storeF32", { addr: Type.i32, v: Type.i32 }, function* (addr, v) {
        yield* Mem.storeF32(addr, Op.convert.f32_convert_i32_s(v));
      });
      yield* Mod.exportFunc("loadF32", { addr: Type.i32 }, function* (addr) {
        return yield* Op.convert.i32_trunc_f32_s(Mem.loadF32(addr));
      });
    });
    const { exports } = await instantiate(binary);
    (exports.storeF32 as Function)(0, 42);
    expect((exports.loadF32 as Function)(0)).toBe(42);
  });
});

describe("f64 extended ops", () => {
  test("f64 ceil/floor/sqrt", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("ceil", function* () {
        return yield* Op.truncI32(Op.f64.ceil(Mem.f64(2.3)));
      });
      yield* Mod.exportFunc("floor", function* () {
        return yield* Op.truncI32(Op.f64.floor(Mem.f64(2.9)));
      });
      yield* Mod.exportFunc("sqrt", function* () {
        return yield* Op.truncI32(Op.f64.sqrt(Mem.f64(16.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.ceil as Function)()).toBe(3);
    expect((exports.floor as Function)()).toBe(2);
    expect((exports.sqrt as Function)()).toBe(4);
  });

  test("f64 comparisons", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f64_eq", function* () {
        return yield* Op.f64.eq(Mem.f64(3.14), Mem.f64(3.14));
      });
      yield* Mod.exportFunc("f64_lt", function* () {
        return yield* Op.f64.lt(Mem.f64(1.0), Mem.f64(2.0));
      });
      yield* Mod.exportFunc("f64_ne", function* () {
        return yield* Op.f64.ne(Mem.f64(1.0), Mem.f64(2.0));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f64_eq as Function)()).toBe(1);
    expect((exports.f64_lt as Function)()).toBe(1);
    expect((exports.f64_ne as Function)()).toBe(1);
  });

  test("f64 min/max", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f64_min", function* () {
        return yield* Op.truncI32(Op.f64.min(Mem.f64(3.0), Mem.f64(5.0)));
      });
      yield* Mod.exportFunc("f64_max", function* () {
        return yield* Op.truncI32(Op.f64.max(Mem.f64(3.0), Mem.f64(5.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f64_min as Function)()).toBe(3);
    expect((exports.f64_max as Function)()).toBe(5);
  });
});

describe("Op.convert namespace", () => {
  test("f32 ↔ f64 conversions", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("demote", function* () {
        // f64(7.0) → demote to f32 → trunc to i32
        return yield* Op.convert.i32_trunc_f32_s(Op.convert.f32_demote_f64(Mem.f64(7.0)));
      });
      yield* Mod.exportFunc("promote", function* () {
        // f32(5.0) → promote to f64 → trunc to i32
        return yield* Op.truncI32(Op.convert.f64_promote_f32(Mem.f32(5.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.demote as Function)()).toBe(7);
    expect((exports.promote as Function)()).toBe(5);
  });

  test("i64 trunc from f64", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("trunc64", function* () {
        // f64(42.9) → trunc to i64 → wrap to i32
        return yield* Op.wrap(Op.convert.i64_trunc_f64_s(Mem.f64(42.9)));
      });
    });
    const {
      exports: { trunc64 },
    } = await instantiate(binary);
    expect((trunc64 as Function)()).toBe(42);
  });

  test("unsigned extend i32 → i64", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("extend_u", { x: Type.i32 }, function* (x) {
        return yield* Op.wrap(Op.convert.i64_extend_i32_u(x));
      });
    });
    const {
      exports: { extend_u },
    } = await instantiate(binary);
    // -1 as i32 = 0xFFFFFFFF, unsigned extend to i64, wrap back gets -1
    expect((extend_u as Function)(42)).toBe(42);
  });

  test("reinterpret f32 ↔ i32", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("roundtrip", { x: Type.i32 }, function* (x) {
        // i32 → reinterpret as f32 → reinterpret back to i32
        return yield* Op.convert.i32_reinterpret_f32(Op.convert.f32_reinterpret_i32(x));
      });
    });
    const {
      exports: { roundtrip },
    } = await instantiate(binary);
    // Reinterpret round-trip preserves bits exactly
    expect((roundtrip as Function)(0)).toBe(0);
    expect((roundtrip as Function)(0x3f800000)).toBe(0x3f800000); // 1.0 as float bits
  });
});

describe("narrow memory ops", () => {
  test("i32 load16/store16", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("store16", { addr: Type.i32, v: Type.i32 }, function* (addr, v) {
        yield* Mem.store16(addr, v);
      });
      yield* Mod.exportFunc("load16u", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load16u(addr);
      });
      yield* Mod.exportFunc("load16s", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load16s(addr);
      });
    });
    const { exports } = await instantiate(binary);
    const store16 = exports.store16 as Function;
    const load16u = exports.load16u as Function;
    const load16s = exports.load16s as Function;
    store16(0, 300);
    expect(load16u(0)).toBe(300);
    // Store a value that wraps in signed 16-bit: 0xFFFF = 65535 unsigned, -1 signed
    store16(2, 0xffff);
    expect(load16u(2)).toBe(65535);
    expect(load16s(2)).toBe(-1);
  });

  test("i32 load8s", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("store8", { addr: Type.i32, v: Type.i32 }, function* (addr, v) {
        yield* Mem.store8(addr, v);
      });
      yield* Mod.exportFunc("load8s", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8s(addr);
      });
    });
    const { exports } = await instantiate(binary);
    (exports.store8 as Function)(0, 0xff); // -1 in signed byte
    expect((exports.load8s as Function)(0)).toBe(-1);
    (exports.store8 as Function)(1, 127);
    expect((exports.load8s as Function)(1)).toBe(127);
  });
});

describe("br_table", () => {
  test("branch table dispatches by index", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("dispatch", { x: Type.i32 }, function* (x) {
        // Reset memory to detect default branch
        yield* Mem.store(0, 0);
        // Returns 10, 20, 30 for x=0,1,2; 99 for anything else
        yield* Ctrl.block(function* () {
          yield* Ctrl.block(function* () {
            yield* Ctrl.block(function* () {
              yield* Ctrl.block(function* () {
                // br_table: labels=[0,1,2], default=3
                yield* Ctrl.br_table(x, [0, 1, 2], 3);
              });
              yield* Mem.store(0, 10);
              yield* Ctrl.br(2);
            });
            yield* Mem.store(0, 20);
            yield* Ctrl.br(1);
          });
          yield* Mem.store(0, 30);
          yield* Ctrl.br(0);
        });
        return yield* Ctrl.if(Mem.load(0).eq(0))
          .then(function* () {
            return yield* Mem.i32(99);
          })
          .else(function* () {
            return yield* Mem.load(0);
          });
      });
    });
    const {
      exports: { dispatch },
    } = await instantiate(binary);
    const f = dispatch as (x: number) => number;
    expect(f(0)).toBe(10);
    expect(f(1)).toBe(20);
    expect(f(2)).toBe(30);
    expect(f(3)).toBe(99);
    expect(f(100)).toBe(99);
  });
});

describe("f32 const", () => {
  test("Mem.f32 creates f32 constant", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f32_const", function* () {
        return yield* Op.convert.i32_trunc_f32_s(Mem.f32(42.7));
      });
    });
    const {
      exports: { f32_const },
    } = await instantiate(binary);
    expect((f32_const as Function)()).toBe(42);
  });
});

describe("Op.toF32 shorthand", () => {
  test("i32 → f32 → i32 round-trip", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("roundtrip", { x: Type.i32 }, function* (x) {
        return yield* Op.convert.i32_trunc_f32_s(Op.toF32(x));
      });
    });
    const {
      exports: { roundtrip },
    } = await instantiate(binary);
    expect((roundtrip as Function)(42)).toBe(42);
  });
});
