# Architecture

wasmize のコンパイルパイプラインは 5 つのステージで構成されます。

```
WasmProgram ─→ compile() ─→ emitIR() ─→ buildModule() ─→ WasmBinary<T> (Wasm)
  (1. DSL)     (2. Interpreter)  (3. Codegen)  (4. Module)     (5. Encoder)
```

---

## 1. DSL 層

**ファイル:** `src/dsl/types.ts`, `src/dsl/expr.ts`, `src/dsl/declarations.ts`, `src/dsl/namespaces.ts`, `src/dsl/augment.ts`, `src/dsl/interpreter.ts`, `src/dsl/compiler.ts`

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

// 関数 body の戻り値型（暗黙 coercion 対応）
type FuncReturn = WasmVal | WasmRef | number | void

// 式の型: 解決済みの値 or 遅延 generator
type Expr = WasmVal | FuncGen<WasmVal>

// Phantom-typed binary
type WasmBinary<T> = Uint8Array & { readonly __exports?: T }
```

### プリミティブの 3 分類

| 分類 | yield する | Namespace | 例 |
|------|-----------|-----------|-----|
| 式（pure） | No | `Op`, `Mem` | `Op.add()`, `Op.select()`, `Op.max()`, `Op.min()`, `Op.i64.add()`, `Op.f64.mul()`, `Op.wrap()`, `Op.toF64()`, `Mem.load()`, `Mem.i32()`, `Mem.i64()`, `Mem.f64()`, `Mem.loadI64()`, `Mem.loadF64()`, `Mem.size()`, `Mem.i32Array()`, `Mem.i32Array2D()` |
| 文（statement） | Yes (`StmtInstruction`) | `Loc`, `Mem`, `Mod` | `Loc.set()`, `Mem.store()`, `Mem.storeI64()`, `Mem.storeF64()`, `Ctrl.br()`, `Mod.exportAll()` |
| 制御フロー | Yes (compound) | `Ctrl` | `Ctrl.if().then().else()`, `Ctrl.loop()`, `Ctrl.block()`, `Ctrl.for()`, `Ctrl.while()`, `Ctrl.when()`, `Ctrl.switch().case().default()`, `Ctrl.unreachable()` |

### 使用例

```typescript
import { compile, param, local, Type, Mod, Mem, Ctrl } from "./dsl/compiler";

const binary = compile<{ fib: (n: number) => number }>(function* () {
  const arr = Mem.i32Array();

  const fib = yield* Mod.func(function* () {
    const n = yield* param(Type.i32);
    const i = yield* local(Type.i32);

    yield* arr.store(0, 0);
    yield* arr.store(1, 1);

    return yield* Ctrl.if(n.le(1))
      .then(function* () {
        return yield* arr.load(n);
      })
      .else(function* () {
        yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
          yield* arr.store(i, arr.load(i.sub(1)).add(arr.load(i.sub(2))));
        });
        return yield* arr.load(n);
      });
  });
  yield* Mod.export("fib", fib);
});
```

### Interpreter（3 フェーズ）

**Phase 1**: Module generator を走らせ、全 import/func/export/memory 命令を処理。func の body は保存するだけ（FuncRef を先に割り当て）。

**Phase 2**: 全 FuncRef が確定後、保存された body を順にコンパイル。各 body を `interpretSubBody()` で IRNode 列に変換。

**Phase 3**: 既存の `buildModule()` を呼んで Wasm バイナリ生成。`compile()` は `WasmBinary<T>` を返す。

### 暗黙の return coercion

`FuncBody<FuncReturn>` の戻り値は `coerceReturn()` で自動変換される:

| 戻り値の型 | 変換先 | 例 |
|-----------|--------|-----|
| `WasmVal` | そのまま | `return yield* arr.load(n)` |
| `WasmRef` | `local_get(idx)` | `return count` |
| `number` | `i32.const(n)` | `return -1` |
| `void` / `undefined` | なし | `return` |

これにより `return yield* Loc.get(count)` → `return count`、`return yield* Mem.i32(-1)` → `return -1` と書ける。

### 複合代入メソッド

`WasmRef` のプロトタイプに in-place mutation メソッドを追加（`augment.ts`）:

| メソッド | 等価式 |
|---------|--------|
| `x.incrBy(n)` | `x.set(x.add(n))` |
| `x.decrBy(n)` | `x.set(x.sub(n))` |
| `x.mulBy(n)` | `x.set(x.mul(n))` |
| `x.divBy(n)` | `x.set(x.div(n))` |
| `x.remBy(n)` | `x.set(x.rem(n))` |
| `x.andBy(n)` | `x.set(x.and(n))` |
| `x.orBy(n)` | `x.set(x.or(n))` |
| `x.xorBy(n)` | `x.set(x.xor(n))` |
| `x.shlBy(n)` | `x.set(x.shl(n))` |
| `x.shrBy(n)` | `x.set(x.shr(n))` |

### トップレベル定数ヘルパ

`i32(v)`, `i64(v)`, `f64(v)` をトップレベルで export。`Mem.i32(v)` の別名だが、定数リテラルであることが明確になる。

```typescript
import { i32 } from "./dsl/compiler";
i32(1).shl(col)  // ビットマスク生成
```

### 配列 fill ヘルパ

`Mem.i32Array()` が返すオブジェクトに `fill(startIdx, endIdx, value)` メソッドを追加。内部で while ループに展開。

```typescript
const dp = Mem.i32Array(DP_BASE);
yield* dp.fill(1, amount, INF);  // dp[1]..dp[amount] = INF
```

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

35 種の discriminated union（`op` フィールドで判別）。

| op | フィールド | 説明 |
|----|-----------|------|
| `const_i32` | `v: number` | i32 定数 |
| `const_i64` | `v: number` | i64 定数 |
| `const_f64` | `v: number` | f64 定数 |
| `local_get` | `i: number` | ローカル変数読み取り |
| `local_set` | `i: number`, `val: IRNode` | ローカル変数書き込み |
| `local_tee` | `i: number`, `val: IRNode` | 書き込み + スタックに値を残す |
| `binop` | `kind`, `a`, `b`, `type?` | 二項演算（type: i32/i64/f64） |
| `cmp` | `kind`, `a`, `b`, `type?` | 比較演算（type: i32） |
| `if` | `cond`, `then`, `else`, `type` | 条件分岐 |
| `loop` | `body: IRNode[]` | ループブロック |
| `br_if` | `depth: number`, `cond` | 条件付きブレーク |
| `br` | `depth: number` | 無条件ブレーク |
| `block` | `body: IRNode[]` | ブロックスコープ |
| `seq` | `stmts: IRNode[]` | 逐次実行 |
| `call` | `idx: number`, `args: IRNode[]` | 関数呼び出し |
| `drop` | `val: IRNode` | 値を破棄 |
| `return` | `val: IRNode` | 関数から返る |
| `store_i32` | `addr`, `val` | メモリ書き込み (i32) |
| `load_i32` | `addr` | メモリ読み取り (i32) |
| `store_i32_8` | `addr`, `val` | メモリ書き込み (1 byte) |
| `load_i32_8u` | `addr` | メモリ読み取り (1 byte, 零拡張) |
| `load_i64` | `addr` | メモリ読み取り (i64) |
| `store_i64` | `addr`, `val` | メモリ書き込み (i64) |
| `load_f64` | `addr` | メモリ読み取り (f64) |
| `store_f64` | `addr`, `val` | メモリ書き込み (f64) |
| `select` | `a`, `b`, `cond` | 三項選択 `cond ? a : b` |
| `eqz` | `val`, `type?` | == 0 判定（i32/i64） |
| `f64_neg` | `val` | f64 符号反転 |
| `f64_abs` | `val` | f64 絶対値 |
| `i32_wrap_i64` | `val` | i64 → i32 変換 |
| `i64_extend_i32_s` | `val` | i32 → i64 変換（符号拡張） |
| `f64_convert_i32_s` | `val` | i32 → f64 変換 |
| `i32_trunc_f64_s` | `val` | f64 → i32 変換（切り捨て） |
| `memory_size` | — | メモリサイズ（ページ数） |
| `memory_grow` | `pages` | メモリ拡張 |
| `unreachable` | — | トラップ |
| `nop` | — | 何もしない |
| `effect` | `tag: number`, `payload` | エフェクト発行 |

`binop` / `cmp` / `eqz` の `type` フィールドは省略可能で、デフォルトは `"i32"`（後方互換）。`"i32"` の場合はフィールド自体が省略される。

### BinopKind / CmpKind

```typescript
type BinopKind = "add" | "sub" | "mul" | "div" | "rem"
               | "and" | "or" | "xor" | "shl" | "shr"
               | "div_u" | "rem_u" | "shr_u";  // unsigned

type CmpKind = "eq" | "ne" | "lt" | "gt" | "le" | "ge"
             | "lt_u" | "gt_u" | "le_u" | "ge_u";  // unsigned
```

---

## 3. Codegen

**ファイル:** `src/wasm/codegen.ts`

`emitIR(enc: WasmEncoder, node: IRNode)` が IR ツリーを再帰的にたどり、Wasm opcode を emit します。

### 2D ディスパッチテーブル

`binop` / `cmp` は `node.type || "i32"` を使って型別のテーブルから opcode をルックアップします。

**binopTable:**

| kind | i32 | i64 | f64 |
|------|-----|-----|-----|
| `add` | `i32.add` | `i64.add` | `f64.add` |
| `sub` | `i32.sub` | `i64.sub` | `f64.sub` |
| `mul` | `i32.mul` | `i64.mul` | `f64.mul` |
| `div` | `i32.div_s` | `i64.div_s` | `f64.div` |
| `rem` | `i32.rem_s` | — | — |
| `and/or/xor/shl/shr` | `i32.*` | — | — |
| `div_u/rem_u/shr_u` | `i32.*_u` | — | — |

**cmpTable:** i32 のみ（signed + unsigned）。

### メモリ操作

| ノード | alignment | 説明 |
|--------|-----------|------|
| `store_i32` / `load_i32` | 2 (4-byte) | i32 メモリ操作 |
| `store_i32_8` / `load_i32_8u` | 0 (1-byte) | byte メモリ操作 |
| `store_i64` / `load_i64` | 3 (8-byte) | i64 メモリ操作 |
| `store_f64` / `load_f64` | 3 (8-byte) | f64 メモリ操作 |

### inferType（型推論）

`interpreter.ts` の `inferType(node, ctx)` がIR ノードから結果型を推定します。関数の戻り値型や `if` ブロック型に使用され、以前のハードコード `"i32"` を置き換えます。

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
