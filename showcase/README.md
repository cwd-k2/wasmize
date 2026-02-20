# showcase/

wasmize ライブラリのデモ・教材・ベンチマーク集。
ライブラリ本体（`src/`）とは独立しており、npm パッケージには含まれない。

## ディレクトリ構成

| ディレクトリ          | 内容                                                    |
| --------------------- | ------------------------------------------------------- |
| `examples/problems/`  | 16 のアルゴリズム問題（Layer 1: 低レベル DSL）          |
| `examples/layer3/`    | Layer 3 API（`wasmFunc()`）による単一関数 Wasm 化       |
| `examples/layer2/`    | Layer 2 API（`wasmize()`）による宣言的モジュール        |
| `examples/advanced/`  | 高度機能デモ（Struct, stdlib, intercept, optimizer 等） |
| `examples/realworld/` | 実用ユースケース（画像処理, Game of Life, CRC32 等）    |
| `bench/`              | パフォーマンスベンチマーク・Spec カバレッジ             |
| `app/`                | ブラウザアプリのエントリーポイント                      |
| `ui/`                 | ブラウザ UI（renderer, styles, realworld デモ）         |
| `e2e/`                | Playwright E2E テスト                                   |

## 実行方法

```bash
# 開発サーバー（ブラウザで全デモ実行）
npm run dev

# ベンチマーク
npx vitest bench showcase/bench/perf/

# E2E テスト
npm run test:e2e
```
