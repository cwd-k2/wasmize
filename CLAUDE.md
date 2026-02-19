# wasmize

Generator ベースの DSL で定義したアルゴリズムを Wasm バイナリにコンパイルする PoC。

## Commands

| Script | Command |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc && vite build` |
| `npm run test` | `vitest run`（ユニットテスト） |
| `npm run test:e2e` | `playwright test`（E2E） |
| `npm run typecheck` | `tsc --noEmit` |

## Directory Structure

```
src/                    # ライブラリ（@ エイリアスで import 可能）
  dsl/                  # Generator ベース DSL → Wasm バイナリのコンパイラ
    types.ts            # 型定義（WasmRef, WasmVal, WasmBinary, FuncRef, Instruction 等）
    primitives.ts       # DSL プリミティブ（i32, add, store, if_, loop_ 等）
    interpreter.ts      # compile() — 3 フェーズ Module interpreter
    compiler.ts         # Re-export エントリポイント
    allocator.ts        # BumpAllocator（コンパイル時メモリ管理）
    struct.ts           # Struct 型（フィールドオフセット自動計算）
    string.ts           # 文字列プリミティブ（Str.from, Str.len, Str.eq）
    meta.ts             # Meta namespace（コンパイル時マクロヘルパ）
  wasm/                 # IR 定義・Codegen・Module Builder・Encoder・Opcodes
  stdlib/               # 再利用可能 Wasm 関数ライブラリ
    mem.ts              # memcpy, memset, memcmp
    math.ts             # pow, clamp, abs, lerp
    sort.ts             # sortI32, sortWith（call_indirect）
  inline.ts             # wasmFunc() — Layer 3 インライン API
  declarative.ts        # wasmize() — Layer 2 宣言的 API
  async-bridge.ts       # AsyncBridge（Effect → Async 変換）
  worker-pool.ts        # WorkerPool（並列 Wasm 実行）
  bench.ts              # ベンチマークハーネス
  marshal.ts            # JS ↔ Wasm メモリ転送
  debug.ts              # IR 可視化・メタデータ
  ui/                   # ブラウザ UI（renderer + styles + realworld デモ）
  test-helpers.ts       # instantiate() ヘルパ（WasmBinary<T> → typed exports）
  runner.ts             # 全問題の実行・検証
  realworld-runner.ts   # Realworld デモの実行・UI データ生成
  main.ts               # エントリーポイント
examples/               # 実例・アルゴリズム実装
  problems/             # Layer 1: 15 のアルゴリズム（低レベル DSL）
  layer3/               # Layer 3: wasmFunc() による単一関数 Wasm 化
  layer2/               # Layer 2: wasmize() による宣言的モジュール
  advanced/             # 高度機能（Struct, stdlib sort, bench）
  realworld/            # 実用ユースケース（画像処理, Game of Life, CRC32, 粒子シミュレーション, 畳み込み, セピア, ヒストグラム）
e2e/                    # Playwright E2E テスト
bench/                  # パフォーマンスベンチマーク
docs/                   # 技術ドキュメント
```

## Conventions

- **strict TypeScript** + ESM only（`"type": "module"`）
- `as any` は `src/test-helpers.ts` の `instantiate()` 内に封じ込め。テスト・ベンチ・runner では `WasmBinary<T>` による型推論でキャスト不要
- IR ノードは discriminated union（`op` フィールドで判別）
- Generator DSL: `yield*` で合成、`compile()` でバイナリ出力
- プリミティブは Generator を直接返す（IIFE パターン）、body は `function*() {}` factory
- `Expr = WasmVal | FuncGen<WasmVal>` — `resolve()` で統一的に解決
- Namespace は PascalCase（`Mod`, `Op`, `Mem`, `Ctrl`, `Loc`）— ローカル変数との視覚的区別
- 型リテラルは `Type.i32` / `Type.i64` / `Type.f64` 定数を使用（typo 防止 + 補完支援）
- `compile<T>()` の型パラメータで export 関数のシグネチャを宣言。戻り値 `WasmBinary<T>` はファントム型
- `instantiate()` ヘルパでインスタンス化。`const { exports: { fn }, mem } = await instantiate(problem())` パターン
- ループ糖衣: `Ctrl.for(var, start, cond, step, body)`, `Ctrl.while(cond, body)`, `Ctrl.when(cond, body)`, `Ctrl.range(i, n, body)` / `Ctrl.range(i, start, end, body)`
- Range ループ: `Ctrl.range(i, n, body)` は `Ctrl.for(i, 0, i.lt(n), i.add(1), body)` の糖衣。4 引数形式で開始値指定可
- 多方向分岐: `Ctrl.switch(expr).case(v, body).default(body)` — ビルダパターン、dense 時 br_table / sparse 時 if/else チェイン
- 値選択: `Op.select(cond, a, b)` は Wasm `select` 命令、`Op.max(a, b)` / `Op.min(a, b)` は select ベース
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽、`.at(i)` で `FieldAccessor` 取得、`.swap(i, j, tmp)` で要素交換、`.fill(start, end, value)` で一括初期化。`base` はランタイム `ExprInput` も可
- 2D配列: `Mem.i32Array2D(base, cols)` で `.load(row, col)` / `.store(row, col, val)`
- 一括 export: `Mod.exportAll({ name: funcRef, ... })`
- i32 unsigned ops: `Op.div_u`, `Op.rem_u`, `Op.shr_u`, `Op.lt_u`, `Op.gt_u`, `Op.le_u`, `Op.ge_u`
- i64 演算: `Op.i64.add/sub/mul/div`, `Op.i64.eqz`
- f64 演算: `Op.f64.add/sub/mul/div`, `Op.f64.neg`, `Op.f64.abs`
- 型変換: `Op.wrap` (i64→i32), `Op.extend` (i32→i64), `Op.toF64` (i32→f64), `Op.truncI32` (f64→i32)
- 定数ヘルパ: トップレベル `i32(v)`, `i64(v)`, `f64(v)` で chainable 定数生成（`i32(1).shl(col)` 等）。`Mem.i32/i64/f64` のエイリアス
- 暗黙戻り値変換: 関数本体から `return count`（WasmRef → local_get）や `return 0`（number → i32.const）が直接可能。`FuncReturn = WasmVal | WasmRef | number | void`
- 破壊的更新: `x.incrBy(v)`, `x.decrBy(v)`, `x.mulBy(v)`, `x.divBy(v)`, `x.remBy(v)`, `x.andBy(v)`, `x.orBy(v)`, `x.xorBy(v)`, `x.shlBy(v)`, `x.shrBy(v)`（`WasmRef` は `x.set(x.op(v))` の糖衣、`FieldAccessor` は load-modify-store を 1 命令列に最適化）
- Struct フィールドアクセス: `points.at(i).x` は `FieldAccessor` を返す Proxy。`.set(v)`, `.incrBy(v)` 等の mutation メソッド + `ChainableExpr` として読み取り可。動的インデックスの `at()` は single-use（キャッシュ不可）
- Packed fields: `Struct({ r: "u8", g: "u8", b: "u8" })` — `u8`/`u16` は sub-word メモリ命令でアクセスし、Wasm スタック上は `i32`
- 単項演算: float `.neg()/.abs()/.sqrt()/.ceil()/.floor()/.trunc()/.nearest()`、int `.clz()/.ctz()/.popcnt()`、全型 `.eqz()`（`WasmRef` + `ChainableExpr` の両方で使用可）
- 型変換メソッド: `.toF64()`, `.toI32()`, `.toI64()`, `.toF32()` — source 型から自動ディスパッチ（`WasmRef` + `ChainableExpr`）
- クランプ: `expr.clamp(min, max)` — float は native `min`/`max` 命令、int は `select`+`cmp`（`ChainableExpr` のみ）
- typed メモリ: `Mem.loadI64/storeI64`, `Mem.loadF64/storeF64`
- メモリシステム: `Mem.size()`, `Mem.grow(pages)`
- トラップ: `Ctrl.unreachable()`
- `binop`/`cmp`/`eqz` の IR ノードは `type?: WasmValType` で i32/i64/f64 をディスパッチ（省略時 i32）
- `inferType(node, ctx)` が IR ノードから結果型を推定（関数戻り値型・if ブロック型に使用）
- 多態型システム: `WasmRef<T>` は `_valType` でランタイム型を保持し、`.add()` 等がディスパッチ。`ChainableExpr<T>` がチェイン全体で型を伝搬。`this: WasmRef<IntType>` で float への bitwise/rem を禁止。`CallableFunc<Params>` と `ModNamespace` オーバーロードでアリティ推論

### JS メタプログラミング

Generator DSL は JS ランタイム上で実行されるため、JS/TS はチューリング完全なプリプロセッサとして機能する。JS の `for` ループ内で `yield*` した命令はコンパイル時に展開され、実行時の Wasm には現れない。

- Config 配列 + `for...of`: 同一パターンの N 方向展開（flood-fill 4 方向、Game of Life 8 近傍）
- ファクトリ関数: 共通 body を関数化し、差分をコールバックで注入（array-stats の reduceFunc）
- 文字列キー軸抽象化: Struct フィールドを `p[fieldName]` で動的アクセス（particles 壁反射）
- チャンネルループ: `for (const c of [0, 1, 2])` で RGB 3 チャンネルを処理（grayscale）
- **注意:** `FieldAccessor` / `ChainableExpr` は内部 Generator が single-use。キャッシュせず毎回 Proxy 経由で取得する。詳細は [docs/metaprogramming.md](docs/metaprogramming.md)

#### Meta namespace（コンパイル時マクロヘルパ）

`Meta` namespace は `() => [...]` array body 内でも使えるコンパイル時展開ヘルパを提供。全て zero-overhead（生成 Wasm に痕跡なし）。

- `Meta.each(items, (item, i) => [...])`: 配列の各要素に対してステートメント展開。`for...of` の `() => [...]` body 互換版
- `Meta.times(n, (i) => [...])`: N 回展開
- `Meta.when(condition, () => [...])`: JS 条件が falsy なら命令を一切生成しない
- `Meta.sum(exprs)`: N 個の式を加算チェイン。`ChainableExpr` を返す
- `Meta.product(exprs)`: N 個の式を乗算チェイン
- `Meta.weightedSum([{weight, expr}, ...])`: 重み付き加算。weight=0 はスキップ、weight=1 は乗算省略
- `Meta.neighbors4`: 4 近傍オフセット `[{dx,dy}, ...]`（Right, Left, Down, Up）
- `Meta.neighbors8`: 8 近傍オフセット（center 除く）

### Known TS Limitations (polymorphic type system)

1. **`& ExprInput[]` intersection** (`expr.ts` CallableFunc): mapped type `{ [K in keyof Params]: ExprInput }` は TS が配列と証明できないため rest parameter に使えない。`& ExprInput[]` で回避するが、Params が **invariant** になる副作用がある
2. **`as unknown as ModNamespace`** (`namespaces.ts`): 上記の invariance により、実装の `CallableFunc`（wide）がインターフェースの `CallableFunc<[]>` 等に代入不可。unsafe cast で橋渡し
3. **`recursive` の self はアリティ未チェック** (`namespaces.ts`): self に `CallableFunc<{mapped}>` を入れると circular inference + invariance で型推論が破綻するため、`CallableFunc`（引数数制約なし）で妥協

## Path Alias

`@/*` → `./src/*` で src 配下を参照可能。`tsconfig.json` (paths) + `vite.config.ts` (resolve.alias) で設定。

```typescript
import { compile } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";
```

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Metaprogramming](docs/metaprogramming.md) — JS メタプログラミングパターン
- [Problems](docs/problems.md) — 15 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
