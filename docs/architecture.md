# Architecture

wasmize のコンパイルパイプラインは 5 つのステージで構成されます。

```
WasmProgram ─→ compile() ─→ emitIR() ─→ buildModule() ─→ Uint8Array (Wasm)
  (1. DSL)     (2. Interpreter)  (3. Codegen)  (4. Module)     (5. Encoder)
```

---

## 1. DSL 層

**ファイル:** `src/dsl/types.ts`, `src/dsl/primitives.ts`, `src/dsl/interpreter.ts`, `src/dsl/compiler.ts`

Generator ベースの DSL。`yield*` による直感的な合成と、ローカル変数の自動管理を提供します。

### 2 レベルの Generator

- **Module レベル**: `WasmProgram` — `Mod.import`, `Mod.func`, `Mod.export`, `Mod.memory` を yield
- **Function レベル**: `FuncBody` — `param`, `local`, 式・文・制御フローを yield

### 型システム

```typescript
// Opaque 参照型
interface WasmRef  { _tag: "ref";  _idx: number }   // ローカル変数/パラメータ
interface WasmVal  { _tag: "val";  _node: IRNode }   // 式の値
interface FuncRef  { _tag: "func"; _idx: number }    // 関数参照

// Generator 型
type FuncGen<T>  = Generator<FuncInstruction, T, any>  // yield* 用
type FuncBody<T> = () => Generator<FuncInstruction, T, any>  // body 用
type ModuleGen<T> = Generator<ModuleInstruction, T, any>
type WasmProgram = () => Generator<ModuleInstruction, void, any>

// 式の型: 解決済みの値 or 遅延 generator
type Expr = WasmVal | FuncGen<WasmVal>
```

### プリミティブの 3 分類

| 分類 | yield する | Namespace | 例 |
|------|-----------|-----------|-----|
| 式（pure） | No | `Op`, `Mem` | `Op.add()`, `Mem.load()`, `Mem.i32()` |
| 文（statement） | Yes (`StmtInstruction`) | `Loc`, `Mem`, `Ctrl` | `Loc.set()`, `Mem.store()`, `Ctrl.br()` |
| 制御フロー | Yes (compound) | `Ctrl` | `Ctrl.if()`, `Ctrl.loop()`, `Ctrl.block()` |

### 使用例

```typescript
import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "./dsl/compiler";

const fibonacci: WasmProgram = function* () {
  const fib = yield* Mod.func(function* () {
    const n = yield* param(Type.i32);
    const i = yield* local(Type.i32);
    yield* Mem.store(0, 0);
    yield* Mem.store(4, 1);
    return yield* Ctrl.if(n.le(1))
      .then(function* () {
        return yield* Mem.load(n.mul(4));
      })
      .else(function* () {
        yield* Loc.set(i, 2);
        yield* Ctrl.block(function* () {
          yield* Ctrl.loop(function* () {
            yield* Mem.store(
              i.mul(4),
              Mem.load(i.sub(1).mul(4)).add(Mem.load(i.sub(2).mul(4))),
            );
            yield* i.set(i.add(1));
            yield* Ctrl.br_if(0, i.le(n));
          });
        });
        return yield* Mem.load(n.mul(4));
      });
  });
  yield* Mod.export("fib", fib);
};
compile(fibonacci); // → Uint8Array
```

### Interpreter（3 フェーズ）

**Phase 1**: Module generator を走らせ、全 import/func/export/memory 命令を処理。func の body は保存するだけ（FuncRef を先に割り当て）。

**Phase 2**: 全 FuncRef が確定後、保存された body を順にコンパイル。各 body を `interpretSubBody()` で IRNode 列に変換。

**Phase 3**: 既存の `buildModule()` を呼んで Wasm バイナリ生成。

### Expr 解決の仕組み

`resolve()` ヘルパーが `Expr` を WasmVal に解決:

```
Mem.store(0, n.add(1)) の処理フロー:
1. Mem.store() → 内部の store() が Generator を返す
2. yield* Mem.store(...) → interpreter が generator を駆動
3. store 内で resolve(0) → number なので即 return val(const_i32(0))
4. store 内で resolve(n.add(1)) → yield* ChainableExpr
   → resolve(n) → WasmRef なので return val(local_get(idx))
   → resolve(1) → number なので return val(const_i32(1))
   → return val(binop("add", ...))
5. store が StmtInstruction を yield → interpreter が body[] に追加
```

---

## 2. IR 層

**ファイル:** `src/wasm/ir.ts`

### IRNode

20 種の discriminated union（`op` フィールドで判別）。

| op | フィールド | 説明 |
|----|-----------|------|
| `const_i32` | `v: number` | i32 定数 |
| `const_i64` | `v: number` | i64 定数 |
| `local_get` | `i: number` | ローカル変数読み取り |
| `local_set` | `i: number`, `val: IRNode` | ローカル変数書き込み |
| `local_tee` | `i: number`, `val: IRNode` | 書き込み + スタックに値を残す |
| `binop` | `kind: BinopKind`, `a`, `b` | 二項演算 |
| `cmp` | `kind: CmpKind`, `a`, `b` | 比較演算 |
| `if` | `cond`, `then`, `else`, `type` | 条件分岐 |
| `loop` | `body: IRNode[]` | ループブロック |
| `br_if` | `depth: number`, `cond` | 条件付きブレーク |
| `br` | `depth: number` | 無条件ブレーク |
| `block` | `body: IRNode[]` | ブロックスコープ |
| `seq` | `stmts: IRNode[]` | 逐次実行 |
| `call` | `idx: number`, `args: IRNode[]` | 関数呼び出し |
| `drop` | `val: IRNode` | 値を破棄 |
| `return` | `val: IRNode` | 関数から返る |
| `store_i32` | `addr`, `val` | メモリ書き込み |
| `load_i32` | `addr` | メモリ読み取り |
| `nop` | — | 何もしない |
| `effect` | `tag: number`, `payload` | エフェクト発行 |

### BinopKind / CmpKind

```typescript
type BinopKind = "add" | "sub" | "mul" | "div" | "rem"
               | "and" | "or" | "xor" | "shl" | "shr";

type CmpKind = "eq" | "ne" | "lt" | "gt" | "le" | "ge";
```

---

## 3. Codegen

**ファイル:** `src/wasm/codegen.ts`

`emitIR(enc: WasmEncoder, node: IRNode)` が IR ツリーを再帰的にたどり、Wasm opcode を emit します。

### 二項演算マッピング

| BinopKind | Wasm opcode |
|-----------|------------|
| `add` | `i32.add` (0x6a) |
| `sub` | `i32.sub` (0x6b) |
| `mul` | `i32.mul` (0x6c) |
| `div` | `i32.div_s` (0x6d) |
| `rem` | `i32.rem_s` (0x6f) |
| `and` | `i32.and` (0x71) |
| `or` | `i32.or` (0x72) |
| `xor` | `i32.xor` (0x73) |
| `shl` | `i32.shl` (0x74) |
| `shr` | `i32.shr_s` (0x75) |

### 比較演算マッピング

| CmpKind | Wasm opcode |
|---------|------------|
| `eq` | `i32.eq` (0x46) |
| `ne` | `i32.ne` (0x47) |
| `lt` | `i32.lt_s` (0x48) |
| `gt` | `i32.gt_s` (0x4a) |
| `le` | `i32.le_s` (0x4c) |
| `ge` | `i32.ge_s` (0x4e) |

### メモリ操作

`store_i32` / `load_i32` は alignment=2 (4 バイト境界)、offset=0 で emit。

### Effect ノード

`effect` は `mem[0]` に tag、`mem[4]` に payload を書き込み、`i32.const(-1)` + `return` で関数を抜けます。

---

## 4. Module Builder

**ファイル:** `src/wasm/module.ts`

`buildModule(funcs, options)` が Wasm バイナリの各セクションを順に構築します。

### セクション構成

| Section ID | 名前 | 内容 |
|-----------|------|------|
| 1 | Type | 関数型定義（`0x60` + params + results）。重複排除あり |
| 2 | Import | import 関数（module 名 + 関数名 + type index） |
| 3 | Function | ローカル関数の type index 参照 |
| 5 | Memory | 線形メモリ宣言（min pages のみ） |
| 7 | Export | `memory` (kind=0x02) + 関数 export (kind=0x00) |
| 10 | Code | 関数本体（locals 宣言 + IR emit + end） |

### 型の重複排除

`JSON.stringify([params, results])` をキーにした `Map` で同一シグネチャの型を共有します。

---

## 5. Encoder

**ファイル:** `src/wasm/encoder.ts`

### WasmEncoder

バイト列を組み立てるユーティリティクラス。

| メソッド | 説明 |
|---------|------|
| `byte(b)` | 1 バイト追加（0xff マスク） |
| `u32(v)` | Unsigned LEB128 エンコード |
| `i32(v)` | Signed LEB128 エンコード |
| `i64(v)` | Signed LEB128（小さい値は i32 にフォールバック） |
| `f64(v)` | IEEE754 8 バイト |
| `vec(items, fn)` | 長さプレフィックス付きベクタ |
| `section(id, fn)` | セクション ID + 長さ + 内容 |
| `raw(arr)` | バイト配列を直接追加 |
| `toBuffer()` | `Uint8Array` に変換 |

---

## 6. 関数インデックス空間

Wasm の関数インデックスは **import が先頭を占有** し、ローカル関数はその後に続きます。

```
Index:  0        1        ...  N-1      N        N+1     ...
       ┌────────┬────────┬────┬────────┬────────┬────────┐
       │import 0│import 1│ ...│import  │ func 0 │ func 1 │...
       │        │        │    │  N-1   │        │        │
       └────────┴────────┴────┴────────┴────────┴────────┘
       ←──── imports ────→     ←──── local funcs ────→
```

`compile()` が自動的にインデックスを管理します:

- `yield* Mod.import(...)` → FuncRef(0), FuncRef(1), ...
- `yield* Mod.func(...)` → FuncRef(N), FuncRef(N+1), ...

**例: Tower of Hanoi**
- `Mod.import("env", "effect_move", ...)` → FuncRef(0)
- `Mod.func(function* () { ... })` → FuncRef(1)
- `call(hanoi, ...)` = FuncRef(1) で自分自身を再帰呼び出し
- `call_(effect_move, ...)` = FuncRef(0) で void import を呼び出し
