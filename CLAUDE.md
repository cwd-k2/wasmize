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
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Problems](docs/problems.md) — 15 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
