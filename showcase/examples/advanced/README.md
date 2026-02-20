# advanced/ — 高度機能デモ

wasmize の拡張機能をデモする例題集。

## ファイル一覧

| ファイル              | デモする機能                                                |
| --------------------- | ----------------------------------------------------------- |
| `struct-points.ts`    | `Struct` 型、FieldAccessor、Struct 配列                     |
| `stdlib-sort.ts`      | stdlib `sortWith`（`call_indirect` + `Mod.table`）          |
| `bench-sieve.ts`      | `bench()` ベンチマークハーネス                              |
| `intercept-trace.ts`  | `withTrace()` による Generator インターセプト・トレース収集 |
| `custom-optimizer.ts` | カスタム `OptimizerPass` 作成と `withoutPasses()`           |
| `capability-check.ts` | `scanFeatures()` + `suggestTarget()` による機能チェック     |
| `bounds-guard.ts`     | `withBoundsCheck()` メモリ境界ガード                        |
| `optimizer-report.ts` | `compileWithReport()` 最適化前後の IR 比較レポート          |
