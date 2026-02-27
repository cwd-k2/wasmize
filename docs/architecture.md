# Architecture

wasmize のコンパイルパイプラインは 5 つのコアステージ + 最適化 + 高レベル API で構成されます。

> **Note:** 本ドキュメント内のファイルパス（`src/dsl/...` 等）は `packages/core/` からの相対パスです。showcase のファイルは `packages/showcase/` に配置されています。

```
WasmProgram ─→ compile() ─→ optimize() ─→ emitIR() ─→ buildModule() ─→ WasmBinary<T>
  (1. DSL)   (2. Interpreter)  (3. Optimizer)  (4. Codegen)  (5. Module + Encoder)

高レベル API:
  wasmFunc()  ─→ compile + instantiate + marshal  (Layer 3: 1 関数)
  wasmize()   ─→ compile + allocator + marshal    (Layer 2: 宣言的モジュール)
```

---

## 1. DSL 層

**ファイル:** `src/dsl/types.ts`, `src/dsl/expr.ts`, `src/dsl/declarations.ts`, `src/dsl/namespaces.ts`, `src/dsl/augment.ts`, `src/dsl/interpreter.ts`, `src/dsl/compiler.ts`, `src/dsl/allocator.ts`, `src/dsl/struct.ts`, `src/dsl/string.ts`, `src/dsl/intercept.ts`, `src/dsl/diagnostics.ts`, `src/dsl/meta.ts`, `src/dsl/queue.ts`, `src/dsl/stack.ts`, `src/dsl/ringbuffer.ts`, `src/dsl/bitset.ts`, `src/dsl/minheap.ts`, `src/dsl/maxheap.ts`, `src/dsl/hashmap.ts`, `src/dsl/union-find.ts`, `src/dsl/deque.ts`, `src/dsl/hashset.ts`, `src/dsl/graph.ts`, `src/dsl/sorted-array.ts`, `src/dsl/segment-tree.ts`, `src/dsl/lru-cache.ts`

Generator ベースの DSL。`yield*` による直感的な合成と、ローカル変数の自動管理を提供します。

### 2 レベルの Generator

- **Module レベル**: `WasmProgram` — `Mod.import`, `Mod.func`, `Mod.export`, `Mod.memory` を yield
- **Function レベル**: `FuncBody` — `param`, `local`, 式・文・制御フローを yield

### 型システム

```typescript
// Opaque 参照型
interface WasmRef {
  _tag: "ref";
  _idx: number;
} // ローカル変数/パラメータ
interface WasmVal {
  _tag: "val";
  _node: IRNode;
} // 式の値
interface FuncRef {
  _tag: "func";
  _idx: number;
} // 関数参照

// Generator 型
type FuncGen<T> = Generator<FuncInstruction, T, any>; // yield* 用
type FuncBody<T> = () => Generator<FuncInstruction, T, any>; // body 用
type ModuleGen<T> = Generator<ModuleInstruction, T, any>;
type WasmProgram = () => Generator<ModuleInstruction, void, any>;

// 関数 body の戻り値型（暗黙 coercion 対応）
type FuncReturn = WasmVal | WasmRef | number | void;

// 式の型: 解決済みの値 or 遅延 generator
type Expr = WasmVal | FuncGen<WasmVal>;

// Phantom-typed binary
type WasmBinary<T> = Uint8Array & { readonly __exports?: T };
```

### プリミティブの 3 分類

| 分類            | yield する              | Namespace           | 例                                                                                                                                                                                                                                                      |
| --------------- | ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 式（pure）      | No                      | `Op`, `Mem`         | `Op.add()`, `Op.select()`, `Op.max()`, `Op.min()`, `Op.i64.add()`, `Op.f64.mul()`, `Op.wrap()`, `Op.toF64()`, `Mem.load()`, `Mem.i32()`, `Mem.i64()`, `Mem.f64()`, `Mem.loadI64()`, `Mem.loadF64()`, `Mem.size()`, `Mem.i32Array()`, `Mem.i32Array2D()` |
| 文（statement） | Yes (`StmtInstruction`) | `Loc`, `Mem`, `Mod` | `Loc.set()`, `Mem.store()`, `Mem.storeI64()`, `Mem.storeF64()`, `Ctrl.br()`, `Mod.exportAll()`                                                                                                                                                          |
| 制御フロー      | Yes (compound)          | `Ctrl`              | `Ctrl.if().then().else()`, `Ctrl.loop()`, `Ctrl.block()`, `Ctrl.for()`, `Ctrl.while()`, `Ctrl.when()`, `Ctrl.range()`, `Ctrl.switch().case().default()`, `Ctrl.unreachable()`                                                                           |

### 使用例

```typescript
import { compile, param, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";

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

| 戻り値の型           | 変換先           | 例                          |
| -------------------- | ---------------- | --------------------------- |
| `WasmVal`            | そのまま         | `return yield* arr.load(n)` |
| `WasmRef`            | `local_get(idx)` | `return count`              |
| `number`             | `i32.const(n)`   | `return -1`                 |
| `void` / `undefined` | なし             | `return`                    |

これにより `return yield* Loc.get(count)` → `return count`、`return yield* Mem.i32(-1)` → `return -1` と書ける。

### 複合代入メソッド

`WasmRef` のプロトタイプに in-place mutation メソッドを追加（`augment.ts`）:

| メソッド      | 等価式            |
| ------------- | ----------------- |
| `x.incrBy(n)` | `x.set(x.add(n))` |
| `x.decrBy(n)` | `x.set(x.sub(n))` |
| `x.mulBy(n)`  | `x.set(x.mul(n))` |
| `x.divBy(n)`  | `x.set(x.div(n))` |
| `x.remBy(n)`  | `x.set(x.rem(n))` |
| `x.andBy(n)`  | `x.set(x.and(n))` |
| `x.orBy(n)`   | `x.set(x.or(n))`  |
| `x.xorBy(n)`  | `x.set(x.xor(n))` |
| `x.shlBy(n)`  | `x.set(x.shl(n))` |
| `x.shrBy(n)`  | `x.set(x.shr(n))` |

### 単項演算メソッド

`WasmRef` と `ChainableExpr` の両方で使用可能。TS の `this` 型制約で不正な型の組み合わせをコンパイル時に検出。

| カテゴリ | メソッド                                                                       | 対象型             |
| -------- | ------------------------------------------------------------------------------ | ------------------ |
| Float    | `.neg()`, `.abs()`, `.sqrt()`, `.ceil()`, `.floor()`, `.trunc()`, `.nearest()` | f32, f64           |
| Int      | `.clz()`, `.ctz()`, `.popcnt()`                                                | i32, i64           |
| 全型     | `.eqz()` → `ChainableExpr<"i32">`                                              | i32, i64, f32, f64 |

### 型変換メソッド

`.toF64()`, `.toI32()`, `.toI64()`, `.toF32()` — source 型に基づいて適切な Wasm conversion 命令を自動選択。同型変換は no-op（`this` をそのまま返す）。

```typescript
const f = yield * local(Type.f64, 3.14);
const i = f.toI32(); // i32.trunc_f64_s
```

### クランプメソッド

`ChainableExpr.clamp(min, max)` — 値を `[min, max]` の範囲に制限。

- Float (f32/f64): native `min`/`max` 命令を使用（`max(min(self, max_val), min_val)`）
- Int (i32/i64): `select` + `cmp` で実現（`min`/`max` 命令がないため）

### トップレベル定数ヘルパ

`i32(v)`, `i64(v)`, `f64(v)` をトップレベルで export。`Mem.i32(v)` の別名だが、定数リテラルであることが明確になる。

```typescript
import { i32 } from "@/dsl/compiler";
i32(1).shl(col); // ビットマスク生成
```

### 配列ヘルパの拡張

`Mem.i32Array(base)` は `base` として `ExprInput`（ランタイム式を含む）を受け付ける。返すオブジェクトは以下のメソッドを持つ:

| メソッド                | 戻り値                 | 説明                                           |
| ----------------------- | ---------------------- | ---------------------------------------------- |
| `load(idx)`             | `ChainableExpr`        | i32 読み取り                                   |
| `store(idx, val)`       | `FuncGen<void>`        | i32 書き込み                                   |
| `at(idx)`               | `FieldAccessor<"i32">` | `.set()`, `.incrBy()` 等の mutation + 読み取り |
| `swap(i, j, tmp)`       | `FuncGen<void>`        | 要素交換                                       |
| `fill(start, end, val)` | `FuncGen<void>`        | 一括初期化                                     |

```typescript
const dp = Mem.i32Array(DP_BASE);
yield * dp.fill(1, amount, INF); // dp[1]..dp[amount] = INF
yield * dp.at(i).incrBy(1); // dp[i]++
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

41 種の discriminated union（`op` フィールドで判別）。

| op                       | フィールド                                 | 説明                               |
| ------------------------ | ------------------------------------------ | ---------------------------------- |
| `const_i32`              | `v: number`                                | i32 定数                           |
| `const_i64`              | `v: number`                                | i64 定数                           |
| `const_f32`              | `v: number`                                | f32 定数                           |
| `const_f64`              | `v: number`                                | f64 定数                           |
| `local_get`              | `i: number`                                | ローカル変数読み取り               |
| `local_set`              | `i: number`, `val: IRNode`                 | ローカル変数書き込み               |
| `local_tee`              | `i: number`, `val: IRNode`                 | 書き込み + スタックに値を残す      |
| `global_get`             | `i: number`                                | グローバル変数読み取り             |
| `global_set`             | `i: number`, `val: IRNode`                 | グローバル変数書き込み             |
| `binop`                  | `kind`, `a`, `b`, `type?`                  | 二項演算（type: i32/i64/f64）      |
| `cmp`                    | `kind`, `a`, `b`, `type?`                  | 比較演算（type: i32）              |
| `unary`                  | `kind`, `val`, `type?`                     | 単項演算（clz, ctz, popcnt 等）    |
| `convert`                | `kind`, `val`                              | 型変換（sign-ext, sat trunc 含む） |
| `if`                     | `cond`, `then`, `else`, `type`             | 条件分岐                           |
| `loop`                   | `body: IRNode[]`                           | ループブロック                     |
| `br_if`                  | `depth: number`, `cond`                    | 条件付きブレーク                   |
| `br`                     | `depth: number`                            | 無条件ブレーク                     |
| `br_table`               | `labels`, `default`, `index`               | 多方向分岐テーブル                 |
| `block`                  | `body: IRNode[]`                           | ブロックスコープ                   |
| `seq`                    | `stmts: IRNode[]`                          | 逐次実行                           |
| `call`                   | `idx: number`, `args: IRNode[]`            | 関数呼び出し                       |
| `call_indirect`          | `typeIdx`, `tableIdx`, `args`, `indexExpr` | テーブル経由の間接呼び出し         |
| `return_call`            | `idx`, `args`                              | 末尾呼び出し（tail call）          |
| `return_call_indirect`   | `typeIdx`, `tableIdx`, `args`, `indexExpr` | 末尾間接呼び出し                   |
| `drop`                   | `val: IRNode`                              | 値を破棄                           |
| `return`                 | `val: IRNode`                              | 関数から返る                       |
| `store_i32`              | `addr`, `val`                              | メモリ書き込み (i32)               |
| `load_i32`               | `addr`                                     | メモリ読み取り (i32)               |
| `store_i32_8`            | `addr`, `val`                              | メモリ書き込み (1 byte)            |
| `load_i32_8u`            | `addr`                                     | メモリ読み取り (1 byte, 零拡張)    |
| `mem_load`               | `addr`, `kind`, `align`                    | 汎用メモリ読み取り（i16 等）       |
| `mem_store`              | `addr`, `val`, `kind`, `align`             | 汎用メモリ書き込み（i16 等）       |
| `load_i64`               | `addr`                                     | メモリ読み取り (i64)               |
| `store_i64`              | `addr`, `val`                              | メモリ書き込み (i64)               |
| `load_f64`               | `addr`                                     | メモリ読み取り (f64)               |
| `store_f64`              | `addr`, `val`                              | メモリ書き込み (f64)               |
| `select`                 | `a`, `b`, `cond`                           | 三項選択 `cond ? a : b`            |
| `eqz`                    | `val`, `type?`                             | == 0 判定（i32/i64）               |
| `f64_neg`                | `val`                                      | f64 符号反転                       |
| `f64_abs`                | `val`                                      | f64 絶対値                         |
| `i32_wrap_i64`           | `val`                                      | i64 → i32 変換                     |
| `i64_extend_i32_s`       | `val`                                      | i32 → i64 変換（符号拡張）         |
| `f64_convert_i32_s`      | `val`                                      | i32 → f64 変換                     |
| `i32_trunc_f64_s`        | `val`                                      | f64 → i32 変換（切り捨て）         |
| `memory_size`            | —                                          | メモリサイズ（ページ数）           |
| `memory_grow`            | `pages`                                    | メモリ拡張                         |
| `memory_copy`            | `dst`, `src`, `len`                        | bulk memory: メモリコピー          |
| `memory_fill`            | `dst`, `val`, `len`                        | bulk memory: メモリフィル          |
| `memory_init`            | `segIdx`, `dst`, `src`, `len`              | bulk memory: data segment 初期化   |
| `data_drop`              | `segIdx`                                   | bulk memory: data segment 破棄     |
| `multi_value`            | `values: IRNode[]`                         | 多値パック（Tuple）                |
| `stack_local_set`        | `i`, `stackPos`                            | 多値アンパック（stack → local）    |
| `unreachable`            | —                                          | トラップ                           |
| `nop`                    | —                                          | 何もしない                         |
| `effect`                 | `tag: number`, `payload`                   | エフェクト発行                     |

`binop` / `cmp` / `eqz` の `type` フィールドは省略可能で、デフォルトは `"i32"`（後方互換）。`"i32"` の場合はフィールド自体が省略される。

### BinopKind / CmpKind

```typescript
type BinopKind =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "rem"
  | "and"
  | "or"
  | "xor"
  | "shl"
  | "shr"
  | "div_u"
  | "rem_u"
  | "shr_u"; // unsigned

type CmpKind = "eq" | "ne" | "lt" | "gt" | "le" | "ge" | "lt_u" | "gt_u" | "le_u" | "ge_u"; // unsigned
```

---

## 3. Codegen

**ファイル:** `src/wasm/codegen.ts`

`emitIR(enc: WasmEncoder, node: IRNode)` が IR ツリーを再帰的にたどり、Wasm opcode を emit します。

### 2D ディスパッチテーブル

`binop` / `cmp` は `node.type || "i32"` を使って型別のテーブルから opcode をルックアップします。

**binopTable:**

| kind                 | i32         | i64         | f64       |
| -------------------- | ----------- | ----------- | --------- |
| `add`                | `i32.add`   | `i64.add`   | `f64.add` |
| `sub`                | `i32.sub`   | `i64.sub`   | `f64.sub` |
| `mul`                | `i32.mul`   | `i64.mul`   | `f64.mul` |
| `div`                | `i32.div_s` | `i64.div_s` | `f64.div` |
| `rem`                | `i32.rem_s` | —           | —         |
| `and/or/xor/shl/shr` | `i32.*`     | —           | —         |
| `div_u/rem_u/shr_u`  | `i32.*_u`   | —           | —         |

**cmpTable:** i32 のみ（signed + unsigned）。

### メモリ操作

| ノード                        | alignment  | 説明            |
| ----------------------------- | ---------- | --------------- |
| `store_i32` / `load_i32`      | 2 (4-byte) | i32 メモリ操作  |
| `store_i32_8` / `load_i32_8u` | 0 (1-byte) | byte メモリ操作 |
| `store_i64` / `load_i64`      | 3 (8-byte) | i64 メモリ操作  |
| `store_f64` / `load_f64`      | 3 (8-byte) | f64 メモリ操作  |

### inferType（型推論）

`interpreter.ts` の `inferType(node, ctx)` がIR ノードから結果型を推定します。関数の戻り値型や `if` ブロック型に使用され、以前のハードコード `"i32"` を置き換えます。

### Effect ノード

`effect` は `mem[0]` に tag、`mem[4]` に payload を書き込み、`i32.const(-1)` + `return` で関数を抜けます。

---

## 4. Module Builder

**ファイル:** `src/wasm/module.ts`

`buildModule(funcs, options)` が Wasm バイナリの各セクションを順に構築します。

### セクション構成

| Section ID | 名前       | 内容                                                       |
| ---------- | ---------- | ---------------------------------------------------------- |
| 1          | Type       | 関数型定義（`0x60` + params + results）。重複排除あり      |
| 2          | Import     | import 関数（module 名 + 関数名 + type index）             |
| 3          | Function   | ローカル関数の type index 参照                             |
| 4          | Table      | `funcref` テーブル宣言（`call_indirect` 用、複数テーブル対応） |
| 5          | Memory     | 線形メモリ宣言（min pages のみ）                           |
| 6          | Global     | グローバル変数宣言（mutable globals 対応）                 |
| 7          | Export     | `memory` (kind=0x02) + 関数 export (kind=0x00)             |
| 8          | Start      | Start function（モジュール初期化時に自動実行）             |
| 9          | Element    | テーブル初期化（関数インデックス列）                       |
| 10         | Code       | 関数本体（locals 宣言 + IR emit + end）                    |
| 11         | Data       | 静的データセグメント（active + passive 対応）              |
| 12         | Data Count | Bulk memory 用のデータセグメント数（先行宣言）             |
| —          | Name       | カスタムセクション：関数・ローカル変数名（debug 用）       |

### 型の重複排除

`JSON.stringify([params, results])` をキーにした `Map` で同一シグネチャの型を共有します。

---

## 5. Encoder

**ファイル:** `src/wasm/encoder.ts`

### WasmEncoder

バイト列を組み立てるユーティリティクラス。

| メソッド          | 説明                                             |
| ----------------- | ------------------------------------------------ |
| `byte(b)`         | 1 バイト追加（0xff マスク）                      |
| `u32(v)`          | Unsigned LEB128 エンコード                       |
| `i32(v)`          | Signed LEB128 エンコード                         |
| `i64(v)`          | Signed LEB128（小さい値は i32 にフォールバック） |
| `f64(v)`          | IEEE754 8 バイト                                 |
| `vec(items, fn)`  | 長さプレフィックス付きベクタ                     |
| `section(id, fn)` | セクション ID + 長さ + 内容                      |
| `raw(arr)`        | バイト配列を直接追加                             |
| `toBuffer()`      | `Uint8Array` に変換                              |

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

---

## 7. IR 最適化（プラグイン式）

**ファイル:** `src/wasm/optimize.ts`（薄いファサード）, `src/wasm/optimizer-passes.ts`（パス定義 + インフラ）

### アーキテクチャ

最適化パイプラインはプラグイン式で設計されており、個々のパスを着脱・追加・順序変更できます。

```
IRNode[] ──→ optimizeFunc(body, config?) ──→ IRNode[]
              │
              ├─ createOptimizer(passes) → bottom-up traversal
              │    visitChildren(node, recurse)  // 子ノード先行
              │    pass1.transform(node)         // パスチェイン
              │    pass2.transform(node)
              │    ...
              │
              └─ eliminateDeadCode(nodes)  // return/br/unreachable 後のコード除去
              │
              └─ (iterations 回繰り返し、デフォルト 2)
```

### OptimizerPass interface

```typescript
interface OptimizerPass {
  readonly name: string;
  transform(node: IRNode): IRNode;
}

interface OptimizerConfig {
  passes?: OptimizerPass[]; // デフォルト: builtinPasses
  iterations?: number; // デフォルト: 2
}
```

### visitChildren

`visitChildren(node, visit)` が IR ツリーの全 variant（42+ 種）を網羅的に走査。leaf ノードはスキップ、子を持つノードは再帰的に `visit` を適用して新しいノードを返します。オプティマイザだけでなく `scanFeatures`（capabilities）でも共有。

### Builtin パス（9 個）

| パス名                     | 変換                                        | 例                           |
| -------------------------- | ------------------------------------------- | ---------------------------- |
| `block-simplification`     | 空ブロック除去、単一要素 unwrap             | `block([x])` → `x`           |
| `constant-folding`         | 定数畳み込み（binop/cmp/eqz/unary/convert） | `3 + 4` → `7`                |
| `identity-elimination`     | 恒等変換除去                                | `x + 0` → `x`, `x * 1` → `x` |
| `self-cancelling`          | 自己相殺                                    | `x - x` → `0`, `x ^ x` → `0` |
| `strength-reduction`       | 演算強度削減                                | `x * 8` → `x << 3`           |
| `comparison-inversion`     | 否定比較合成                                | `eqz(lt(a,b))` → `ge(a,b)`   |
| `round-trip-elimination`   | 型変換ラウンドトリップ除去                  | `wrap(extend(x))` → `x`      |
| `algebraic-simplification` | 代数的簡約化                                | `neg(neg(x))` → `x`          |
| `condition-elimination`    | 定数条件の分岐除去                          | `if(1, then, else)` → `then` |

### カスタムパスの使用

```typescript
import { compile } from "@/dsl/compiler";
import type { OptimizerPass } from "@/wasm/optimize";

const doubleConst: OptimizerPass = {
  name: "double-const",
  transform(node) {
    if (node.op === "const_i32") return IR.const_i32(node.v * 2);
    return node;
  },
};

compile(program, {
  optimizerConfig: { passes: [doubleConst], iterations: 1 },
});
```

### パスの除外

```typescript
import { withoutPasses } from "@/wasm/optimize";

// constant-folding を除外して最適化
compile(program, {
  optimizerConfig: { passes: withoutPasses(["constant-folding"]) },
});
```

---

## 8. WAT 出力

**ファイル:** `src/wasm/wat.ts`

`compileToWAT(program)` が DSL プログラムから WebAssembly Text Format を生成します。バイナリと同じ `compile()` の Phase 1-2 を共有し、Phase 3 で WAT テキストを生成します。

```typescript
import { compileToWAT } from "@/wasm/wat";
const wat = compileToWAT(myProgram); // string
```

デバッグ・学習・他ツールとの連携に使用。

---

## 9. 高レベル API

### Layer 3: `wasmFunc()` — インライン Wasm 関数

**ファイル:** `src/inline.ts`

1 関数だけを Wasm 化する最小 API。配列パラメータの自動マーシャリング、コンパイル結果のキャッシュを提供。

```typescript
import { wasmFunc } from "@/inline";
const add = await wasmFunc({ a: "i32", b: "i32" }, "i32", function* (a, b) {
  return a.add(b);
});
add(3, 4); // 7
```

### Layer 2: `wasmize()` — 宣言的モジュール

**ファイル:** `src/declarative.ts`

メモリレイアウト自動管理 + 複数関数の宣言的定義。`layout` で TypedArray ビューを自動割当。

```typescript
import { wasmize } from "@/declarative";
const mod = await wasmize({
  layout: { arr: { type: "i32", count: 256 } },
  functions: {
    sum: { params: { len: "i32" }, body: function* (len) { ... } },
  },
});
mod.layout.arr.set([1, 2, 3]);
mod.exports.sum(3); // 6
```

### BumpAllocator

**ファイル:** `src/dsl/allocator.ts`

コンパイル時のメモリ領域管理。手動オフセット計算を排除。

```typescript
const alloc = new BumpAllocator();
const arr = alloc.i32Array(256); // 自動的に base を割当
const dp = alloc.i32Array2D(100, cols);
alloc.requiredPages; // 必要なメモリページ数
```

### Struct 型

**ファイル:** `src/dsl/struct.ts`

構造化データのメモリレイアウトを型安全に管理。フィールドオフセット・アラインメント・パディングをコンパイル時に計算。

```typescript
const Point = Struct({ x: "i32", y: "i32" });
Point.size; // 8 bytes
const points = Point.array(alloc, 100);
points.get(i, "x"); // ChainableExpr<"i32">
points.set(i, "y", val); // FuncGen<void>
```

#### OOP スタイルアクセス（FieldAccessor）

`Struct.at(base)` / `StructArray.at(index)` は Proxy ベースの `StructAccessor` を返す。各フィールドは `FieldAccessor`（`ChainableExpr` のサブクラス）で、読み取り + `.set()` + in-place mutation（`.incrBy()` 等）を提供。

```typescript
const p = points.at(i);
yield * p.x.incrBy(dx); // load-modify-store in one sequence
yield * p.y.set(0); // direct write
return p.x.add(p.y); // read as ChainableExpr
```

**注意:** 動的 `ExprInput` インデックスで取得した `at()` プロキシは single-use。`ChainableExpr` が内部で single-use generator を保持するため、同じプロキシの複数フィールドアクセスには `get()` メソッドを使用する。

#### Packed fields（u8/u16）

`FieldType` は `WasmValType | "u8" | "u16"` に拡張。packed field はサブワードメモリ命令（`i32.load8_u`, `i32.store16` 等）でアクセスし、Wasm スタック上は `i32` として扱われる。

```typescript
const Pixel = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" });
Pixel.size; // 4 bytes (1+1+1+1, align 1)
```

### データ構造ヘルパ

Generator ファクトリパターンで実装された、再利用可能なデータ構造。`yield*` でローカル変数を内部に確保し、操作メソッドを持つハンドルを返す。

| データ構造       | ファイル                  | 生成方法                                  | 主な操作                                                  |
| ---------------- | ------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| **Queue**        | `src/dsl/queue.ts`       | `yield* Queue(base)`                      | `enqueue`, `dequeue`, `notEmpty`, `reset`                 |
| **Stack**        | `src/dsl/stack.ts`       | `yield* Stack(base)`                      | `push`, `pop`, `peek`, `notEmpty`, `reset`                |
| **RingBuffer**   | `src/dsl/ringbuffer.ts`  | `yield* RingBuffer(base, cap)`            | `write`, `read`, `isFull`, `isEmpty`, `reset`             |
| **BitSet**       | `src/dsl/bitset.ts`      | `BitSet(base)`（plain function）          | `set`, `get`, `clear`, `clearAll`                         |
| **MinHeap**      | `src/dsl/minheap.ts`     | `yield* MinHeap(base)`                    | `insert`, `extractMin`, `peekPriority`, `notEmpty`        |
| **MaxHeap**      | `src/dsl/maxheap.ts`     | `yield* MaxHeap(base)`                    | `insert`, `extractMax`, `peekPriority`, `notEmpty`        |
| **HashMap**      | `src/dsl/hashmap.ts`     | `yield* HashMap(base, capacity)`          | `set`, `get`, `has`, `delete`, `clear`, `notEmpty`        |
| **HashSet**      | `src/dsl/hashset.ts`     | `yield* HashSet(base, capacity)`          | `add`, `has`, `delete`, `clear`, `notEmpty`               |
| **Deque**        | `src/dsl/deque.ts`       | `yield* Deque(base, capacity)`            | `pushFront`, `pushBack`, `popFront`, `popBack`, `isEmpty` |
| **UnionFind**    | `src/dsl/union-find.ts`  | `yield* UnionFind(base, capacity)`        | `find`, `union`, `connected`                              |
| **Graph**        | `src/dsl/graph.ts`       | `Graph(vertexBase, edgeBase)`（plain）    | `degree`, `edgeStart`, `edge`, `forEachNeighbor`          |
| **SortedArray**  | `src/dsl/sorted-array.ts`| `yield* SortedArray(base, capacity)`      | `insert`, `delete`, `has`, `at`, `size`                   |
| **SegmentTree**  | `src/dsl/segment-tree.ts`| `yield* SegmentTree(base, n)`             | `update`, `query`, `build`                                |
| **LRUCache**     | `src/dsl/lru-cache.ts`   | `yield* LRUCache(base, capacity)`         | `get`, `set`, `has`, `notEmpty`                           |

```typescript
// MinHeap: Dijkstra の priority queue として使用
const heap = yield* MinHeap(heapBase);
yield* heap.insert(distance, cellIndex);
yield* heap.extractMin(dstPri, dstVal);

// HashMap: 頻度カウントの upsert パターン
const map = yield* HashMap(mapBase, 256); // capacity は 2 の冪
yield* Ctrl.if(map.has(key))
  .then(function* () {
    yield* map.get(key, tmp);
    yield* map.set(key, tmp.add(1));
  })
  .else(function* () {
    yield* map.set(key, 1);
  });
```

### 文字列サポート

**ファイル:** `src/dsl/string.ts`

UTF-8 文字列操作。`Str.from()` は data segment に埋め込み、`Str.len()` / `Str.eq()` は Wasm 関数として実装。

### Realworld Examples

**ファイル:** `packages/showcase/examples/realworld/`

実用的なユースケースを示す 4 つの例。ブラウザ UI でインタラクティブに動作するデモ付き。

| Example          | DSL 特徴                                                                           | ファイル          |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------- |
| **Grayscale**    | `Mem.load8/store8` バイト操作, `Op.max/min` ブランチレスクランプ, チャンネルループ | `grayscale.ts`    |
| **CRC32**        | `Mod.data()` ルックアップテーブル, `Op.shr_u` 符号なしシフト                       | `crc32.ts`        |
| **Game of Life** | `Ctrl.grid` + `inRange` 境界チェック, ダブルバッファリング, ブランチレス alive 判定 | `game-of-life.ts` |
| **Particles**    | `Struct` + `BumpAllocator`, f64 フィールド, 軸ループによる壁反射                   | `particles.ts`    |

各 example は `async function` を export し、`{ exports, setXxx, getXxx, binary }` のパターンで JS ラッパを返す。`showcase/app/realworld-runner.ts` がこれらを統合し、`showcase/ui/realworld.ts` が Canvas ベースのインタラクティブデモをレンダリングする。

### JS メタプログラミング

Generator DSL は JS ランタイム上で実行されるため、**JS/TS がチューリング完全なプリプロセッサ** として機能する。JS の `for` ループ内で `yield*` した命令はコンパイル時に展開され、実行時の Wasm バイナリにはループのオーバーヘッドが存在しない。

主要パターン:

- **Config 配列 + for...of**: flood-fill の 4 方向、Game of Life の 8 近傍
- **ファクトリ関数**: array-stats の sum/max/min を 1 つの `reduceFunc` で統一
- **文字列キー軸抽象化**: particles の x/y 壁反射を 1 ループに圧縮

詳細は [docs/metaprogramming.md](metaprogramming.md) を参照。

### Marshal レイヤー

**ファイル:** `src/runtime/marshal.ts`

JS 配列・文字列と Wasm 線形メモリ間の型安全なデータ転送。`writeI32Array()`, `readI32Array()`, `writeString()`, `readString()` 等。

---

## 10. 標準ライブラリ (stdlib)

**ファイル:** `src/stdlib/`

再利用可能な Wasm 関数を `Mod.use()` でモジュールに組み込み。

| モジュール          | 関数                                                             | 説明                                                     |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `stdlib/mem`        | `memcpy`, `memset`, `memcmp`                                     | バイトレベルメモリ操作                                   |
| `stdlib/math`       | `pow`, `clamp`, `abs`, `lerp`, `gcd`, `lcm`, `gcdI64`           | 整数演算 + GCD/LCM                                      |
| `stdlib/math-f64`   | `log`, `log2`, `exp`, `pow_f64`                                  | f64 超越関数（多項式近似）                               |
| `stdlib/trig`       | `sin`, `cos`, `tan`, `atan2`                                     | f64 三角関数（Chebyshev/CORDIC）                         |
| `stdlib/sort`       | `sortI32`, `sortWith`, `mergeSort`                               | i32 特化 + コンパレータ付き汎用ソート（`call_indirect`） |
| `stdlib/sort-int`   | `countingSort`, `radixSort`                                      | 整数特化ソート（計数, 基数）                             |
| `stdlib/search`     | `binarySearch`, `lowerBound`, `upperBound`                       | 配列探索（二分探索, 下界/上界）                          |
| `stdlib/string-algo`| `kmpBuildFailure`, `kmpSearch`                                   | KMP 文字列パターンマッチング                             |
| `stdlib/matrix`     | `matTranspose`, `matMulF64`, `matScale`                          | 行列演算（転置, f64 乗算, スカラ倍）                     |
| `stdlib/color`      | `rgbToHsl`, `hslToRgb`                                           | RGB↔HSL 色空間変換                                       |
| `stdlib/bits`       | `isPowerOf2`, `log2Floor`, `nextPowerOf2Func`, `bswap32`         | ビット演算ユーティリティ                                 |
| `stdlib/fixed`      | `fixedFromInt`, `fixedFromF64`, `fixedToF64`, `fixedAdd/Sub/Mul/Div` | 固定小数点演算（16.16 形式）                         |
| `stdlib/modular`    | `modpow`, `modinv`                                               | モジュラ演算（べき乗, 逆元）                             |
| `stdlib/prng`       | `usePrng()`                                                      | 擬似乱数生成器（Xorshift）                              |
| `stdlib/graph-algo` | `bfs()`, `dfs()`, `dijkstra()`                                   | グラフアルゴリズム（CSR 形式）                           |

```typescript
import { sortI32 } from "@/stdlib/sort";
const sort = yield * Mod.use(sortI32);
yield * sort(arrBase, 0, len.sub(1));
```

---

## 11. ランタイムヘルパ

### AsyncBridge

**ファイル:** `src/runtime/async-bridge.ts`

Effect → Async 変換。Wasm の effect（`mem[0]` = tag, `mem[4]` = payload, return -1）を `on(tag, handler)` で非同期ハンドラにディスパッチ。

### WorkerPool

**ファイル:** `src/runtime/worker-pool.ts`

並列 Wasm 実行。ブラウザ（Web Worker）と Node.js（worker_threads）の両環境に対応。

**WorkerState 型安全管理**: 各 Worker の状態は `WorkerState` interface（`worker`, `pending: Map`, `nextId`）で管理。以前の `(worker as any).__pending` による monkey-patching を排除。

**タスク重複排除（opt-in）**: `new WorkerPool(binary, { workers: 4, dedup: true })` で同一引数の in-flight タスクを自動的に重複排除。`Map<string, Promise>` で管理し、完了後にエントリを削除。

```typescript
const pool = new WorkerPool(binary, { workers: 4, dedup: true });
const p1 = pool.run("compute", [42]);
const p2 = pool.run("compute", [42]); // dedup: p1 と同じ Promise
const p3 = pool.run("compute", [99]); // 別引数: 新規タスク
```

### ベンチマークハーネス

**ファイル:** `src/bench.ts`

Wasm vs JS のパフォーマンス比較。warmup, iterations, 統計（mean, median, stddev, speedup）を提供。

---

## 12. Generator Intercept

**ファイル:** `src/dsl/intercept.ts`

ydant の `keyed()` パターンを移植した co-routine proxy。Generator の `yield` をインターセプトし、変換して再 yield する。interpreter の応答（`WasmRef`, `WasmVal` 等）は元の generator に正しく転送される。

### API

| 関数                                       | 用途                                        |
| ------------------------------------------ | ------------------------------------------- |
| `intercept(gen, transform)`                | `FuncInstruction` レベルで全 yield を変換   |
| `interceptIR(gen, transform)`              | `stmt` の `IRNode` のみ変換（便利ラッパー） |
| `withTrace(label, gen, collector)`         | 非破壊的にトレース情報を収集                |
| `interceptModule(gen, transform)`          | `ModuleInstruction` レベルの変換            |
| `composeIntercepts(gen, ...transforms)`    | 複数変換を左→右でチェイン                   |
| `interceptFilter(gen, shouldDrop)`         | stmt をドロップ（decl はスキップ不可）      |
| `interceptWhen(gen, predicate, transform)` | 条件付き変換                                |

### 核心パターン

```typescript
function* intercept<T extends FuncReturn>(
  gen: FuncGen<T>,
  transform: (instr: FuncInstruction) => FuncInstruction,
): FuncGen<T> {
  let next = gen.next();
  while (!next.done) {
    const response = yield transform(next.value); // 変換して再 yield
    next = gen.next(response); // interpreter の応答を転送
  }
  return next.value;
}
```

**重要**: `response` の転送が不可欠。`decl` は `WasmRef` を、値付き `if` は `WasmVal` を返す。

### 派生ツール

| ファイル        | 関数                                             | 用途                                            |
| --------------- | ------------------------------------------------ | ----------------------------------------------- |
| `instrument.ts` | `createProfile()`, `withProfiling(gen, profile)` | コンパイル時命令カウント（zero-overhead）       |
| `guard.ts`      | `withBoundsCheck(gen, maxBytes)`                 | メモリ境界ガード（OOB で unreachable トラップ） |
| `debug.ts`      | `traceBody(label, collector, body)`              | 関数 body をトレース付きでラップ                |

---

## 13. Capability Tracking

**ファイル:** `src/wasm/capabilities.ts`

Wasm プログラムが必要とする feature を IR 走査で自動検出し、target runtime との互換性を検証する。

### Feature Set

```typescript
type WasmFeature =
  | "mvp"
  | "bulk-memory"
  | "multi-value"
  | "sign-extension"
  | "mutable-globals"
  | "simd"
  | "gc"
  | "tail-call"
  | "exception-handling"
  | "reference-types";

const Features = {
  MVP: featureSet("mvp"),
  Standard: featureSet("mvp", "bulk-memory", "multi-value", "sign-extension", "mutable-globals"),
  All: featureSet(/* 全 10 feature */),
};
```

### IR Feature Scanner

`scanFeatures(funcs)` が IR ツリーを `visitChildren`（optimizer-passes.ts と共有）で走査し、使用されている feature を `Set<WasmFeature>` として返す。検出対象:

- `global_set` → `"mutable-globals"`
- `func.results.length > 1` → `"multi-value"`
- `convert` ノードの sign-extension 系 kind → `"sign-extension"`
- `call_indirect` → `"reference-types"`
- `memory_copy` / `memory_fill` / `memory_init` / `data_drop` → `"bulk-memory"`
- `return_call` / `return_call_indirect` → `"tail-call"`

### ユーティリティ

| 関数                            | 用途                                              |
| ------------------------------- | ------------------------------------------------- |
| `describeFeature(f)`            | human-readable な feature 説明 + ブラウザ対応状況 |
| `suggestTarget(funcs)`          | 最小限のプリセット（MVP/Standard/All）を推薦      |
| `customFeatureSet(...features)` | カスタム FeatureSet 生成                          |

### IR 統計・最適化レポート

| ファイル              | 関数                                        | 用途                                        |
| --------------------- | ------------------------------------------- | ------------------------------------------- |
| `ir-stats.ts`         | `analyzeFunc(body)`, `analyzeModule(funcs)` | IR 統計分析（ノード数, 深度, メモリ操作等） |
| `ir-stats.ts`         | `formatStats(stats)`                        | 統計の人間可読出力                          |
| `optimizer-report.ts` | `compileWithReport(program, options?)`      | 最適化前後の統計比較 + バイナリ出力         |
| `optimizer-report.ts` | `formatReport(report)`                      | レポートのサマリー表示                      |

### compile() との統合

```typescript
compile(program, { target: Features.MVP }); // MVP 非対応の命令があれば Error
compile(program, { target: Features.Standard }); // Standard 互換チェック
compile(program); // target 省略 → validation なし
```

---

## 14. 静的検証・Diagnostics

**ファイル:** `src/dsl/diagnostics.ts`

`DiagnosticCollector` がコンパイル中に問題を収集し、`compileWithDiagnostics()` 経由で呼び出し元に返す。

| 検出項目                | レベル    | 説明                                       |
| ----------------------- | --------- | ------------------------------------------ |
| 定数オーバーフロー      | `warning` | i32 範囲外のリテラル値を検出               |
| 未使用ローカル変数      | `warning` | 宣言後に参照されないローカル変数           |
| export 名衝突           | `error`   | 同名の関数を複数回 export                  |
| struct フィールド typo  | `warning` | 未定義フィールドへのアクセス               |

```typescript
const { binary, diagnostics } = compileWithDiagnostics(program);
for (const d of diagnostics) {
  console.warn(`[${d.level}] ${d.message}`);
}
```

---

## 15. ツーリング拡張

### Call Graph 解析

**ファイル:** `src/wasm/call-graph.ts`

IR の `call` / `call_indirect` ノードを走査して関数間呼び出しグラフを構築。再帰検出（`findRecursion`）と未使用関数検出（`findUnusedFunctions`）を提供。

### Dead Code 検出

**ファイル:** `src/wasm/dead-code.ts`

`return` / `br` / `unreachable` / 終端 `if` の後にある到達不能コードを検出。`detectDeadCode(funcs)` → `DeadCodeEntry[]`。

### Source Map 生成

**ファイル:** `src/wasm/source-map.ts`

Wasm バイナリオフセット ↔ DSL ソース位置のマッピングを Source Map v3 形式で生成。`SourceMapCollector` がコンパイル中にエントリを収集し、`compileWithSourceMap()` で統合。

### ランタイム拡張

| ファイル                   | 主要 API                                             | 用途                                       |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `runtime/instantiate.ts`   | `instantiateFromUrl`, `instantiateFromResponse`      | Streaming Wasm 読み込み                    |
| `runtime/fuzz.ts`          | `fuzz()`, `Gen.*`                                    | プロパティベーステスト（入力生成 + 縮小）  |
| `runtime/bench-history.ts` | `saveBenchmark`, `loadBenchmark`, `compareBenchmarks` | ベンチマーク履歴とリグレッション検出       |
| `runtime/canvas.ts`        | `writeImageData`, `readImageData`, `syncCanvas`      | Canvas ↔ Wasm メモリのピクセル転送         |
| `runtime/color.ts`         | `rgbToHex`, `hexToRgb`, `lerpColor`                  | JS 側カラーユーティリティ                  |
| `runtime/debug-utils.ts`   | `dumpMemory`, `snapshotMemory`, `diffMemory`         | メモリダンプ・スナップショット・差分比較   |
| `runtime/assertions.ts`    | `assertNoTraps`, `assertTraps`                       | テスト用トラップアサーション               |
| `runtime/graph-marshal.ts` | `buildCSR`, `buildWeightedCSR`, `writeCSR`           | JS エッジリスト → CSR 形式のマーシャリング |
| `runtime/mock.ts`          | `mockImports`                                        | テスト用 Wasm import モック                |

---

## 16. パスエイリアス

`@` エイリアスで `src/` ディレクトリを参照可能。`tsconfig.json` の `paths` と `vite.config.ts` の `resolve.alias` で設定。

```typescript
import { compile } from "@/dsl/compiler";
import { wasmFunc } from "@/inline";
import { instantiate } from "@/runtime/instantiate";
```
