# wasmize

Generator ベースの DSL で定義したアルゴリズムを Wasm バイナリにコンパイルする PoC。

## Commands

| Script              | Command                        |
| ------------------- | ------------------------------ |
| `npm run dev`       | Vite dev server                |
| `npm run build`     | `tsc && vite build`            |
| `npm run test`      | `vitest run`（ユニットテスト） |
| `npm run test:e2e`  | `playwright test`（E2E）       |
| `npm run typecheck` | `tsc --noEmit`                 |

## Directory Structure

```
src/                    # ライブラリ（@ エイリアスで import 可能、npm publish 対象）
  dsl/                  # Generator ベース DSL → Wasm バイナリのコンパイラ
    types.ts            # 型定義（WasmRef, WasmVal, WasmBinary, FuncRef, Instruction 等）
    primitives.ts       # DSL プリミティブ（i32, add, store, if_, loop_ 等）
    interpreter.ts      # compile() — 3 フェーズ Module interpreter
    compiler.ts         # Re-export エントリポイント
    allocator.ts        # BumpAllocator（コンパイル時メモリ管理）
    struct.ts           # Struct 型（フィールドオフセット自動計算）
    string.ts           # 文字列プリミティブ（Str.from, Str.len, Str.eq）
    meta.ts             # Meta namespace（コンパイル時マクロヘルパ）
    queue.ts            # Queue Generator ファクトリ（BFS キュー）
    intercept.ts        # Generator Intercept（yield* 変換・トレース・合成）
    instrument.ts       # コンパイル時命令プロファイル（createProfile, withProfiling）
    guard.ts            # メモリ境界ガード（withBoundsCheck）
  wasm/                 # IR 定義・Codegen・Module Builder・Encoder・Opcodes
    optimizer-passes.ts # プラグイン式オプティマイザパス（9 builtin passes）
    capabilities.ts     # Feature scanning・target validation・utilities
    ir-stats.ts         # IR 統計分析（analyzeFunc, analyzeModule, formatStats）
    optimizer-report.ts # 最適化レポート（compileWithReport, formatReport）
  stdlib/               # 再利用可能 Wasm 関数ライブラリ
    mem.ts              # memcpy, memset, memcmp
    math.ts             # pow, clamp, abs, lerp
    sort.ts             # sortI32, sortWith（call_indirect）
  runtime/              # ホスト統合ユーティリティ（Wasm 実行時）
    instantiate.ts      # instantiate() ヘルパ（WasmBinary<T> → typed exports）
    marshal.ts          # JS ↔ Wasm メモリ転送
    async-bridge.ts     # AsyncBridge（Effect → Async 変換）
    worker-pool.ts      # WorkerPool（並列 Wasm 実行）
  __tests__/            # ライブラリテスト
  inline.ts             # wasmFunc() — Layer 3 インライン API
  declarative.ts        # wasmize() — Layer 2 宣言的 API
  bench.ts              # ベンチマークハーネス
  debug.ts              # IR 可視化・メタデータ・compileWithWat・traceBody
  index.ts, optimizer.ts, worker.ts
showcase/               # デモ・教材・ベンチマーク
  app/                  # ブラウザアプリ
    main.ts             # エントリーポイント
    runner.ts           # 全問題の実行・検証
    realworld-runner.ts # Realworld デモの実行・UI データ生成
  ui/                   # ブラウザ UI（renderer + styles + realworld デモ）
  examples/             # 実例・アルゴリズム実装
    problems/           # Layer 1: 16 のアルゴリズム（低レベル DSL）
    layer3/             # Layer 3: wasmFunc() による単一関数 Wasm 化
    layer2/             # Layer 2: wasmize() による宣言的モジュール
    advanced/           # 高度機能（Struct, stdlib sort, bench, intercept trace, custom optimizer, capability check, bounds guard, optimizer report）
    realworld/          # 実用ユースケース（画像処理, Game of Life, CRC32, 粒子シミュレーション, 畳み込み, セピア, ヒストグラム, Erode/Dilate, Maze BFS, ヒストグラム均等化）
  bench/                # パフォーマンスベンチマーク
  e2e/                  # Playwright E2E テスト
docs/                   # 技術ドキュメント
```

## Conventions

- **strict TypeScript** + ESM only（`"type": "module"`）
- `as any` は `src/runtime/instantiate.ts` の `instantiate()` 内に封じ込め。テスト・ベンチ・runner では `WasmBinary<T>` による型推論でキャスト不要
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
- elseif チェイン: `Ctrl.if(c1).then(b1).elseif(c2).then(b2).else(b3)` — フラットな else-if。IR は既存ネスト if/else と同一。戻り値ありの if-expression としても使用可
- 多方向分岐: `Ctrl.switch(expr).case(v, body).default(body)` — ビルダパターン、dense 時 br_table / sparse 時 if/else チェイン
- 値選択: `Op.select(cond, a, b)` は Wasm `select` 命令、`Op.max(a, b)` / `Op.min(a, b)` は select ベース
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽、`.at(i)` で `FieldAccessor` 取得、`.swap(i, j, tmp)` で要素交換、`.fill(start, end, value)` で一括初期化。`base` はランタイム `ExprInput` も可
- 2D配列: `Mem.i32Array2D(base, cols)` で `.load(row, col)` / `.store(row, col, val)` / `.at(row, col)` で `FieldAccessor` 取得。`base` は `ExprInput`（ランタイム式可）
- バイトグリッド: `Mem.byteGrid(base, cols)` で `.load(row, col)` / `.store(row, col, val)` / `.at(row, col)`。`Mem.load8`/`Mem.store8` ベース、byte-per-cell グリッドに最適
- RGBA プリセット: `RGBA = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" })`。`RGBA.at(offset)` でピクセル読み書き。**注意:** `offset` は `WasmRef`（ローカル変数）を使うこと（`ChainableExpr` は single-use）
- Queue ヘルパ: `const q = yield* Queue(base)` で BFS キュー生成。`q.enqueue(v)`, `q.dequeue(dst)`, `q.notEmpty`（条件式）, `q.reset()` を提供。内部で `head`/`tail` ローカル変数を確保
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
- Generator Intercept: `intercept(gen, transform)` で `yield*` のインターセプト + 変換。`interceptIR(gen, transform)` は stmt の IRNode のみ変換。`withTrace(label, gen, collector)` で非破壊トレース収集。`interceptModule(gen, transform)` でモジュールレベル変換。全て `compiler.ts` から公開 export
- Intercept 合成: `composeIntercepts(gen, ...transforms)` で複数変換を左→右チェイン。`interceptFilter(gen, shouldDrop)` で stmt をドロップ（decl は安全のためスキップ不可）。`interceptWhen(gen, predicate, transform)` で条件付き変換
- Debug 統合: `traceBody(label, collector, body)` で関数 body をトレース付きラップ（`debug.ts` から export）
- 命令プロファイル: `createProfile()` + `withProfiling(gen, profile)` でコンパイル時命令カウント。zero-overhead（`instrument.ts`）
- メモリ境界ガード: `withBoundsCheck(gen, maxBytes)` で store/load に境界チェック挿入。OOB で `unreachable` トラップ。Production では外すだけ（`guard.ts`）
- プラグイン式オプティマイザ: `OptimizerPass` interface（`name` + `transform(node): IRNode`）。`builtinPasses` に 9 パス。`createOptimizer(passes)` で bottom-up 最適化関数を生成。`withoutPasses(names)` でパス除外。`compile()` に `optimizerConfig: { passes?, iterations? }` オプション
- Capability Tracking: `WasmFeature` 型（mvp, bulk-memory, multi-value 等 10 種）。`Features.MVP/Standard/All` プリセット。`scanFeatures(funcs)` で IR 走査・feature 検出（mutable-globals, multi-value, sign-extension, reference-types）。`compile()` に `target: FeatureSet` オプションで target validation。`describeFeature(f)` で human-readable 説明。`suggestTarget(funcs)` で最小プリセット推薦。`customFeatureSet(...features)` でカスタム FeatureSet 生成
- IR 統計: `analyzeFunc(body)` / `analyzeModule(funcs)` で IRStats 取得（totalNodes, nodesByOp, maxDepth, memoryLoads/Stores, branches, calls, localAccesses）。`formatStats(stats)` で人間可読出力
- 最適化レポート: `compileWithReport(program, options)` で最適化前後の IRStats 比較 + バイナリ出力。`formatReport(report)` でサマリー表示
- WorkerPool: `WorkerState` interface で型安全な状態管理（`(worker as any).__pending` を排除）。`dedup: true` オプションで同一引数の in-flight タスク重複排除

### JS メタプログラミング

Generator DSL は JS ランタイム上で実行されるため、JS/TS はチューリング完全なプリプロセッサとして機能する。JS の制御構造やオブジェクト指向機能はコンパイル時に展開され、実行時の Wasm には現れない。

**コンパイル時展開パターン:**

- Config 配列 + `for...of`: 同一パターンの N 方向展開（flood-fill 4 方向、Game of Life 8 近傍）
- ファクトリ関数: 共通 body を関数化し、差分をコールバックで注入（array-stats の reduceFunc）
- 文字列キー軸抽象化: Struct フィールドを `p[fieldName]` で動的アクセス（particles 壁反射）
- チャンネルループ: `for (const ch of ["r", "g", "b"] as const)` で RGB 3 チャンネルを処理（grayscale, sepia）

**OOP-style コンパイル時ヘルパ（メモリ抽象の 3 層構造）:**

- **Layer 1 (Raw)**: `Mem.load/store` — 手動アドレス計算
- **Layer 2 (構造化)**: `Mem.byteGrid(base, cols)`, `Mem.i32Array2D(base, cols)` — ストライド計算隠蔽
- **Layer 3 (ドメイン特化)**: `RGBA.at(offset)` — ピクセル操作、`Queue(base)` — BFS キュー

**Generator ファクトリパターン:** `yield*` でローカル変数を内部に確保し、操作メソッドを持つオブジェクトを返す。`Queue` がこのパターンの代表例。カプセル化された状態（head/tail 等）は呼び出し側から不可視

**注意（single-use 制約）:** `FieldAccessor` / `ChainableExpr` は内部 Generator が single-use。キャッシュせず毎回 Proxy 経由で取得する。**特に `Struct.at(expr)` の `expr` にはローカル変数（`WasmRef`）を使うこと。** `ChainableExpr`（例: `i.mul(4)`）を直接渡すと 2 番目以降のフィールドアクセスで壊れる。詳細は [docs/metaprogramming.md](docs/metaprogramming.md)

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
import { instantiate } from "@/runtime/instantiate";
```

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Metaprogramming](docs/metaprogramming.md) — JS メタプログラミングパターン
- [Problems](docs/problems.md) — 15 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
