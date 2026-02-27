# showcase/

wasmize ライブラリのデモ・教材・ベンチマーク集。
ライブラリ本体（`src/`）とは独立しており、npm パッケージには含まれない。

## ディレクトリ構成

| ディレクトリ          | 内容                                                    |
| --------------------- | ------------------------------------------------------- |
| `examples/problems/`    | 18 のアルゴリズム問題（低レベル DSL）                    |
| `examples/inline/`      | `wasmFunc()` インライン API デモ                        |
| `examples/declarative/` | `wasmize()` 宣言的 API デモ                             |
| `examples/features/`    | DSL 機能デモ（Struct, stdlib, intercept, optimizer 等） |
| `examples/realworld/`   | 実用ユースケース（画像処理, Game of Life, CRC32 等）    |
| `bench/`                | パフォーマンスベンチマーク・Spec カバレッジ             |
| `app/`                  | エントリスクリプト（landing, problems, demos）          |
| `ui/`                   | ブラウザ UI（renderer, nav, styles, realworld デモ）    |
| `e2e/`                  | Playwright E2E テスト                                   |

## 実行方法

```bash
# 開発サーバー（ブラウザで全デモ実行）
npm run dev

# ベンチマーク
npx vitest bench showcase/bench/perf/

# E2E テスト
npm run test:e2e
```
