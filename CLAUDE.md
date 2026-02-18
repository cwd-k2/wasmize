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
src/
  dsl/        # Generator ベース DSL → Wasm バイナリのコンパイラ
    types.ts       # 型定義（WasmRef, WasmVal, WasmBinary, FuncRef, Instruction 等）
    primitives.ts  # DSL プリミティブ（i32, add, store, if_, loop_ 等）
    interpreter.ts # compile() — 3 フェーズ Module interpreter
    compiler.ts    # Re-export エントリポイント
  wasm/       # IR 定義・Codegen・Module Builder・Encoder・Opcodes
  problems/   # 15 のアルゴリズム実装（各 .ts + __tests__/）
  ui/         # ブラウザ UI（renderer + styles）
  test-helpers.ts  # instantiate() ヘルパ（WasmBinary<T> → typed exports）
  runner.ts   # 全問題の実行・検証
  main.ts     # エントリーポイント
e2e/          # Playwright E2E テスト
docs/         # 技術ドキュメント
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
- 多方向分岐: `Ctrl.switch(expr, cases, default?)` — nested if/else に展開
- 値選択: `Op.select(cond, a, b)` は Wasm `select` 命令、`Op.max(a, b)` / `Op.min(a, b)` は select ベース
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽、`.swap(i, j, tmp)` で要素交換
- 2D配列: `Mem.i32Array2D(base, cols)` で `.load(row, col)` / `.store(row, col, val)`
- 一括 export: `Mod.exportAll({ name: funcRef, ... })`
- i32 unsigned ops: `Op.div_u`, `Op.rem_u`, `Op.shr_u`, `Op.lt_u`, `Op.gt_u`, `Op.le_u`, `Op.ge_u`
- i64 演算: `Op.i64.add/sub/mul/div`, `Op.i64.eqz`
- f64 演算: `Op.f64.add/sub/mul/div`, `Op.f64.neg`, `Op.f64.abs`
- 型変換: `Op.wrap` (i64→i32), `Op.extend` (i32→i64), `Op.toF64` (i32→f64), `Op.truncI32` (f64→i32)
- f64 定数: `Mem.f64(v)` — f64 リテラル（`resolve(number)` は常に i32）
- typed メモリ: `Mem.loadI64/storeI64`, `Mem.loadF64/storeF64`
- メモリシステム: `Mem.size()`, `Mem.grow(pages)`
- トラップ: `Ctrl.unreachable()`
- `binop`/`cmp`/`eqz` の IR ノードは `type?: WasmValType` で i32/i64/f64 をディスパッチ（省略時 i32）
- `inferType(node, ctx)` が IR ノードから結果型を推定（関数戻り値型・if ブロック型に使用）

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Problems](docs/problems.md) — 15 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
