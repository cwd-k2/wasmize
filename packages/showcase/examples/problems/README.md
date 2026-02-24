# problems/ — アルゴリズム問題集（Layer 1 DSL）

Generator ベース DSL の低レベル API を使った 16 のアルゴリズム実装。

## 問題一覧

| #   | 名前            | ファイル           | アルゴリズム           | 計算量          | 主要 DSL 機能                 |
| --- | --------------- | ------------------ | ---------------------- | --------------- | ----------------------------- |
| P1  | Tower of Hanoi  | `hanoi.ts`         | 再帰                   | O(2ⁿ)           | `Mod.recursive`               |
| P2  | Fibonacci       | `fibonacci.ts`     | DP (bottom-up)         | O(n)            | `Mem.i32Array`, `Ctrl.range`  |
| P3  | Kadane          | `kadane.ts`        | 貪欲法                 | O(n)            | `Op.max`                      |
| P4  | Coin Change     | `coin-change.ts`   | DP                     | O(amount×coins) | `Op.min`, nested loops        |
| P5  | Binary Search   | `binary-search.ts` | 二分探索               | O(log n)        | `Ctrl.while`, `Loc.return`    |
| P6  | GCD Array       | `gcd.ts`           | ユークリッド           | O(n log max)    | `Ctrl.while`                  |
| P7  | Sieve           | `sieve.ts`         | エラトステネス         | O(n log log n)  | `Mem.store8/load8`            |
| P8  | Matrix Multiply | `matmul.ts`        | 三重ループ             | O(n³)           | `Mem.i32Array2D`              |
| P9  | LCS             | `lcs.ts`           | DP (2D)                | O(m×n)          | `Mem.i32Array2D`, `Mem.load8` |
| P10 | 0/1 Knapsack    | `knapsack.ts`      | DP (2D)                | O(n×W)          | `Mem.i32Array2D`, `Op.max`    |
| P11 | Quicksort       | `quicksort.ts`     | Lomuto 分割            | O(n log n) avg  | `Mod.recursive`, `swap()`     |
| P12 | Flood Fill      | `flood-fill.ts`    | BFS                    | O(rows×cols)    | `Queue`, `Mem.byteGrid`       |
| P13 | LIS             | `lis.ts`           | Patience sort          | O(n log n)      | `Ctrl.while` (二分探索)       |
| P14 | N-Queens        | `nqueens.ts`       | ビットマスク backtrack | O(n!)           | bitwise ops, `i32()`          |
| P15 | Union-Find      | `union-find.ts`    | 経路圧縮+ランク        | O(α(n))         | `Mem.i32Array`                |
| P16 | Edit Distance   | `edit-distance.ts` | DP (2D)                | O(m×n)          | `Mem.i32Array2D`, `Op.min`    |

## パターン

全問題は同一構造:

```typescript
export function problem_name() {
  return compileWithWat<ExportSignature>(function* () {
    yield* Mod.memory(pages);
    // ... DSL コード ...
  });
}
```

`compileWithWat` は `compile()` + WAT テキスト出力を返すデバッグヘルパ。
