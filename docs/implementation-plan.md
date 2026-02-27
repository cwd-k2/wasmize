# Gap Spec 全項目 並行実装計画

## 方針

`docs/gap-spec.md` の全 56 項目を、チームエージェントによる並行作業で実装する。

- **リードエージェント**: コードを書かず、タスク管理・レビュー・コミットに徹する
- **実装エージェント**: 各バッチに 3〜5 エージェントを割り当て、worktree 隔離で並行実装
- **コミット**: バッチごとにマージ・テスト・コミット

## バッチ構成

gap-spec.md の Phase 順序に従いつつ、依存関係のない項目を並行化する。

### Batch 0: 静的解析基盤（Phase 0）
全検証の土台。後続の Phase で diagnostic を利用する。

| ID | 項目 | 担当 |
|----|------|------|
| V-14 | Diagnostic API | agent-1 |
| V-02 | Export 名衝突検出 | agent-2 |
| V-09 | Struct field typo 検出 | agent-3 |
| V-01 | メモリバジェット検証 | agent-1 (V-14 後) |
| V-03 | 関数呼び出し Arity チェック | agent-2 (V-14 後) |
| V-04 | 型ミスマッチ検出 | agent-3 (V-14 後) |

### Batch 1: Wasm Spec + DSL 完備（Phase 1 前半）
既存基盤の穴埋め。各項目は独立。

| ID | 項目 | 担当 |
|----|------|------|
| W-08 | f32 DSL ラッパー | agent-1 |
| W-14 | i64 Bitwise/Comparison DSL 完備 | agent-2 |
| W-01 | Start Section | agent-3 |
| W-02 | Sign-Extension Operations | agent-4 |
| D-06 | rotl/rotr メソッド | agent-5 |

### Batch 2: DSL 糖衣 + stdlib 基礎 + 検証（Phase 1 後半）

| ID | 項目 | 担当 |
|----|------|------|
| D-07 | Mod.useAll バッチ版 | agent-1 |
| S-09 | Bit Manipulation Utilities | agent-2 |
| S-02 | GCD / LCM | agent-3 |
| V-05 | br depth 検証 | agent-4 |
| V-06 | Local 変数インデックス検証 | agent-5 |
| V-07 | Data Segment 重複・境界検証 | agent-5 (V-06 後) |

### Batch 3: Bulk Memory + データ構造（Phase 2）

| ID | 項目 | 担当 |
|----|------|------|
| W-03 | Bulk Memory Operations | agent-1 |
| S-01 | PRNG | agent-2 |
| S-03 | Binary Search | agent-3 |
| S-20 | Deque | agent-4 |
| S-21 | HashSet | agent-5 |

### Batch 4: データ構造 + ランタイム（Phase 2 後半）

| ID | 項目 | 担当 |
|----|------|------|
| S-22 | MaxHeap | agent-1 |
| S-23 | Union-Find | agent-2 |
| R-01 | Memory Growth 対応 | agent-3 |
| V-08 | Allocator 領域重複検出 | agent-4 |
| V-10 | 関数戻り値型の整合性チェック | agent-5 |

### Batch 5: DSL 表現力（Phase 3）

| ID | 項目 | 担当 |
|----|------|------|
| D-01 | 短絡評価ヘルパー | agent-1 |
| D-05 | ループ with break/continue | agent-2 |
| D-08 | Assertions | agent-3 |
| W-05 | Saturating Truncation | agent-4 |
| W-10 | Global Import/Export | agent-5 |

### Batch 6: モジュール連携 + 浮動小数点（Phase 3 後半）

| ID | 項目 | 担当 |
|----|------|------|
| W-13 | Memory Import | agent-1 |
| D-02 | 名前付きラベル | agent-2 |
| W-15 | f32/f64 copysign 等 | agent-3 |
| V-13 | 定数アドレス静的検証 | agent-4 |

### Batch 7: 高度な Wasm 機能（Phase 4 前半）

| ID | 項目 | 担当 |
|----|------|------|
| W-04 | Passive Data Segments | agent-1 |
| W-06 | Multi-Value Blocks | agent-2 |
| W-07 | Tail Calls | agent-3 |
| S-06 | 三角関数近似 | agent-4 |
| S-07 | 対数・指数 | agent-5 |

### Batch 8: ソート + グラフ（Phase 4 後半）

| ID | 項目 | 担当 |
|----|------|------|
| S-04 | Merge Sort | agent-1 |
| S-25 | Graph Adjacency List | agent-2 |
| S-41 | BFS / DFS | agent-3 (S-25 後) |
| S-42 | Dijkstra | agent-4 (S-25 後) |

### Batch 9: ツーリング（Phase 5 前半）

| ID | 項目 | 担当 |
|----|------|------|
| T-01 | Dead Code Detection | agent-1 |
| T-04 | Wasm Assertion Helper | agent-2 |
| R-03 | Import Mock Framework | agent-3 |
| R-04 | Memory Dump / State Snapshot | agent-4 |
| R-05 | Canvas Pixel Sync Helper | agent-5 |

### Batch 10: エッジケース（Phase 5 後半）

| ID | 項目 | 担当 |
|----|------|------|
| W-09 | i16/i8 Array Helpers | agent-1 |
| W-11 | Custom Section (Name Section) | agent-2 |
| D-03 | Tuple 型 | agent-3 |
| V-11 | 定数式オーバーフロー検出 | agent-4 |
| V-12 | 未使用ローカル変数警告 | agent-5 |

### Batch 11: 専門機能（Phase 6 前半）

| ID | 項目 | 担当 |
|----|------|------|
| S-08 | 固定小数点演算 | agent-1 |
| S-10 | Modular Arithmetic | agent-2 |
| S-05 | Counting Sort / Radix Sort | agent-3 |
| S-24 | Segment Tree | agent-4 |
| S-26 | LRU Cache | agent-5 |

### Batch 12: 専門機能（Phase 6 後半）

| ID | 項目 | 担当 |
|----|------|------|
| S-27 | Sorted Array | agent-1 |
| S-43 | String Matching (KMP) | agent-2 |
| S-40 | Matrix Operations | agent-3 |
| R-06 | Color Utilities | agent-4 |
| R-02 | Streaming Instantiation | agent-5 |

### Batch 13: 静的解析 + テスト基盤（Phase 6 残り）

| ID | 項目 | 担当 |
|----|------|------|
| T-02 | Call Graph Analysis | agent-1 |
| T-03 | Performance Regression Tracking | agent-2 |
| T-05 | Source Map / Debug Annotations | agent-3 |
| T-06 | Fuzzing Framework | agent-4 |
| W-12 | Multiple Tables | agent-5 |
| D-04 | Array Body 値返し | agent-5 (W-12 後) |

## ルール

1. 各エージェントは worktree で隔離作業し、マージ時にコンフリクトを解消
2. テストは `pnpm run test` で全パス確認してからコミット
3. 型チェック `pnpm run typecheck` も各バッチ完了時に実施
4. コミットメッセージは `feat(gap-spec): Batch N - 項目リスト` 形式
5. 既存テストを壊さないことを最優先
