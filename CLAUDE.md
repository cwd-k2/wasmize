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
  realworld/            # 実用ユースケース（画像処理, Game of Life, CRC32, 粒子シミュレーション）
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
- ループ糖衣: `Ctrl.for(var, start, cond, step, body)`, `Ctrl.while(cond, body)`, `Ctrl.when(cond, body)`
- 多方向分岐: `Ctrl.switch(expr).case(v, body).default(body)` — ビルダパターン、dense 時 br_table / sparse 時 if/else チェイン
- 値選択: `Op.select(cond, a, b)` は Wasm `select` 命令、`Op.max(a, b)` / `Op.min(a, b)` は select ベース
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽、`.swap(i, j, tmp)` で要素交換、`.fill(start, end, value)` で一括初期化
- 2D配列: `Mem.i32Array2D(base, cols)` で `.load(row, col)` / `.store(row, col, val)`
- 一括 export: `Mod.exportAll({ name: funcRef, ... })`
- i32 unsigned ops: `Op.div_u`, `Op.rem_u`, `Op.shr_u`, `Op.lt_u`, `Op.gt_u`, `Op.le_u`, `Op.ge_u`
- i64 演算: `Op.i64.add/sub/mul/div`, `Op.i64.eqz`
- f64 演算: `Op.f64.add/sub/mul/div`, `Op.f64.neg`, `Op.f64.abs`
- 型変換: `Op.wrap` (i64→i32), `Op.extend` (i32→i64), `Op.toF64` (i32→f64), `Op.truncI32` (f64→i32)
- 定数ヘルパ: トップレベル `i32(v)`, `i64(v)`, `f64(v)` で chainable 定数生成（`i32(1).shl(col)` 等）。`Mem.i32/i64/f64` のエイリアス
- 暗黙戻り値変換: 関数本体から `return count`（WasmRef → local_get）や `return 0`（number → i32.const）が直接可能。`FuncReturn = WasmVal | WasmRef | number | void`
- 破壊的更新: `x.incrBy(v)`, `x.decrBy(v)`, `x.mulBy(v)`, `x.divBy(v)`, `x.remBy(v)`, `x.andBy(v)`, `x.orBy(v)`, `x.xorBy(v)`, `x.shlBy(v)`, `x.shrBy(v)`（`x.set(x.op(v))` の糖衣）
- typed メモリ: `Mem.loadI64/storeI64`, `Mem.loadF64/storeF64`
- メモリシステム: `Mem.size()`, `Mem.grow(pages)`
- トラップ: `Ctrl.unreachable()`
- `binop`/`cmp`/`eqz` の IR ノードは `type?: WasmValType` で i32/i64/f64 をディスパッチ（省略時 i32）
- `inferType(node, ctx)` が IR ノードから結果型を推定（関数戻り値型・if ブロック型に使用）
- 多態型システム: `WasmRef<T>` は `_valType` でランタイム型を保持し、`.add()` 等がディスパッチ。`ChainableExpr<T>` がチェイン全体で型を伝搬。`this: WasmRef<IntType>` で float への bitwise/rem を禁止。`CallableFunc<Params>` と `ModNamespace` オーバーロードでアリティ推論

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
- [Problems](docs/problems.md) — 15 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
