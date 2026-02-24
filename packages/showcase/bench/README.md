# bench/ — ベンチマーク・品質計測

## ディレクトリ構成

| ディレクトリ | 内容                                                  |
| ------------ | ----------------------------------------------------- |
| `perf/`      | Wasm vs JS パフォーマンスベンチマーク（vitest bench） |
| `coverage/`  | Wasm MVP Spec カバレッジ計測                          |
| `human/`     | コード量比較（DSL vs 手書き WAT）                     |

## 実行方法

```bash
# パフォーマンスベンチマーク（全問題）
npx vitest bench showcase/bench/perf/

# 個別実行
npx vitest bench showcase/bench/perf/kadane.bench.ts

# Spec カバレッジ
npx vitest run showcase/bench/coverage/

# コード量比較
npx vitest run showcase/bench/human/
```

## perf/ の構成

各問題に対応する `.bench.ts` ファイルがあり、同一アルゴリズムの Wasm 版と JS 版（`js-impls.ts`）を比較する。
