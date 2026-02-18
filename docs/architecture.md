# Architecture

wasmize のコンパイルパイプラインは 5 つのステージで構成されます。

```
ProblemDesc ─→ DSLContext ─→ emitIR() ─→ buildModule() ─→ Uint8Array (Wasm)
  (1. DSL)     (2. IR)      (3. Codegen)  (4. Module)     (5. Encoder)
```

---

## 1. DSL 層

**ファイル:** `src/dsl/compiler.ts`, `src/dsl/context.ts`

### ProblemDesc

問題定義のトップレベルインターフェース。

```typescript
interface ProblemDesc {
  imports?: ImportDef[];
  funcs: {
    params?: WasmValType[];
    results?: WasmValType[];
    locals?: WasmValType[];
    body: IRNode[];
  }[];
  exports: { name: string; funcIdx: number }[];
  memoryPages?: number;  // デフォルト: 1 (64KB)
}
```

### compileProblem()

`ProblemDesc` を受け取り、`DSLContext` に imports / funcs / exports を登録してから `buildModule()` を呼び出し、`Uint8Array`（Wasm バイナリ）を返します。

### DSLContext

コンパイル過程の中間状態を保持するクラス。

```typescript
class DSLContext {
  ir: IRNode[] = [];
  funcs: FuncDef[] = [];
  imports: ImportDef[] = [];
  exports: ExportDef[] = [];
  effects: unknown[] = [];
  localCount = 0;
  paramCount = 0;
}
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

### IR.* ビルダー API

ファクトリ関数で IRNode を生成。

```typescript
IR.const_i32(42)
IR.binop("add", IR.local_get(0), IR.const_i32(1))
IR.if_then_else(cond, thenBody, elseBody, "i32")
IR.call(funcIdx, [arg1, arg2])
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

### LEB128 アルゴリズム

**Unsigned (u32):**
7 ビットずつ取り出し、残りがあれば継続ビット (0x80) をセット。

**Signed (i32):**
算術右シフトで 7 ビットずつ取り出し、符号ビットが安定したら終了。
終了条件: `(v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40))`

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

`compileProblem()` での計算:

```typescript
const funcOffset = ctx.imports.length;
// ProblemDesc の funcIdx=0 → 実際の index は funcOffset + 0
ctx.exports.push({ name: e.name, idx: funcOffset + e.funcIdx });
```

**例: Tower of Hanoi**
- import `effect_move` → index 0
- ローカル関数 `hanoi` → index 1
- 再帰呼び出しは `IR.call(1, [...])` で自分自身を呼ぶ
- `effect_move` は `IR.call(0, [...])` で呼ぶ

**例: Fibonacci（import なし）**
- ローカル関数 `fib` → index 0
- `funcOffset = 0` なのでそのまま
