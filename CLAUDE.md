# wasmize

DSL で定義したアルゴリズムを Wasm バイナリにコンパイルする PoC。

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
  dsl/        # ProblemDesc → Wasm バイナリのコンパイラ
  wasm/       # IR 定義・Codegen・Module Builder・Encoder・Opcodes
  problems/   # 5 つのアルゴリズム実装（各 .ts + __tests__/）
  ui/         # ブラウザ UI（renderer + styles）
  runner.ts   # 全問題の実行・検証
  main.ts     # エントリーポイント
e2e/          # Playwright E2E テスト
docs/         # 技術ドキュメント
```

## Conventions

- **strict TypeScript** + ESM only（`"type": "module"`）
- `WebAssembly.instantiate` の戻り値には `as any` を使用（型定義の制約）
- IR ノードは discriminated union（`op` フィールドで判別）
- `IR.*` ビルダーでノード生成、`compileProblem()` でバイナリ出力

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Problems](docs/problems.md) — 5 問題のカタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
