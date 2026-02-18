# Workflow Guide

開発時のコマンドの使い分けと典型的なフローをまとめます。

---

## コマンド一覧

| コマンド | 実行内容 | いつ使うか |
|---------|---------|-----------|
| `npm run dev` | Vite dev server 起動 | 開発中。ブラウザで全問題の動作を確認 |
| `npm run build` | `tsc && vite build` | プロダクションビルドの確認 |
| `npm run test` | `vitest run` | コード変更後のユニットテスト |
| `npm run test:e2e` | `playwright test` | UI を含めたエンドツーエンドテスト |
| `npm run typecheck` | `tsc --noEmit` | 型エラーの検出（ビルドなし） |

---

## 開発フロー

### 通常の開発サイクル

```
1. コード編集
2. npm run typecheck   ← 型エラーを素早く検出
3. npm run test        ← ユニットテストで動作確認
4. npm run dev         ← ブラウザで視覚的に確認（任意）
```

`typecheck` → `test` の順で回すのが効率的です。`typecheck` は数秒で完了し、コンパイルエラーを早期に発見できます。

### PR / マージ前の確認

```
npm run typecheck && npm run test && npm run test:e2e
```

E2E テストは Vite dev server を自動起動して Playwright で検証するため、`dev` を手動で立てる必要はありません。

---

## コマンド詳細

### `npm run dev`

Vite dev server を `http://localhost:5173` で起動します。

- `index.html` → `src/main.ts` → `runner.ts` が全 15 問題を実行
- 各問題の PASS/FAIL 状態とテストケース結果がブラウザに表示される
- HMR（Hot Module Replacement）対応 — コード変更が即座に反映

**用途:** 新しい問題の追加や UI 変更時に、結果を目視確認したいとき。

### `npm run test`

vitest をワンショット実行（`vitest run`）します。

- テスト対象: `src/**/__tests__/**/*.test.ts`
- 各問題の `.test.ts` が `compileProblem()` → `WebAssembly.instantiate()` → アサーションを実行
- メモリを使う問題はテスト内でメモリに入力データを書き込み

**用途:** コード変更後の動作確認。CI でも利用。

### `npm run test:e2e`

Playwright でブラウザベースの E2E テストを実行します。

- `playwright.config.ts` で Vite dev server を自動起動
- `e2e/app.test.ts`: 全 15 問題が PASS することを検証
- CI 環境（`process.env.CI`）では dev server を新規起動、ローカルでは既存サーバーを再利用

**用途:** UI レイヤーを含めた統合テスト。PR 前の最終確認。

### `npm run typecheck`

TypeScript コンパイラを `--noEmit` で実行し、型チェックのみ行います。

- `strict: true` — null チェック、暗黙の any 禁止
- `noUnusedLocals` / `noUnusedParameters` — 未使用の変数・引数をエラーに
- `noFallthroughCasesInSwitch` — switch の fall-through を禁止

**用途:** 編集直後に素早く型エラーを確認。ビルドより高速。

### `npm run build`

TypeScript コンパイル + Vite によるプロダクションビルドを実行します。

- `tsc` で型チェック → `vite build` でバンドル
- 出力先はデフォルトの `dist/`

**用途:** デプロイ用ビルドの生成・確認。

---

## 新しい問題を追加するときのフロー

```
1. src/problems/new-problem.ts を作成
2. src/problems/index.ts に re-export を追加
3. src/problems/__tests__/new-problem.test.ts を作成
4. npm run typecheck && npm run test    ← ここまでで基本動作を確認
5. src/runner.ts の runTests() にセクション追加
6. npm run dev                          ← ブラウザで表示確認
7. e2e/app.test.ts の期待 PASS 数を更新
8. npm run test:e2e                     ← E2E 確認
```

詳細なテンプレートは [testing.md](testing.md) を参照してください。
