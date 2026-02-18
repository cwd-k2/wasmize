# Problems

15 のアルゴリズム問題のカタログ。各問題は `src/problems/` に実装され、`compile()` で Wasm バイナリに変換されます。

---

## 1. Tower of Hanoi

**ファイル:** `src/problems/hanoi.ts` | **関数:** `problem1_hanoi()`

### アルゴリズム

古典的な再帰ハノイの塔。n 枚のディスクを `from` → `to` へ `aux` を経由して移動。
- 基底: n ≤ 0 → 0 を返す
- 再帰: hanoi(n-1, from, aux, to) → effect_move(from, to) → hanoi(n-1, aux, to, from)
- 戻り値: count1 + 1 + count2

### Wasm Export

```
hanoi(n: i32, from: i32, to: i32, aux: i32) → i32
```

### Import

```
env.effect_move(from: i32, to: i32) → void
```

### メモリレイアウト

メモリ不使用。

### DSL の見どころ

- `let hanoi: CallableFunc` による前方宣言 + 再帰呼び出し
- `effect_move.void()` による void import 呼び出し

---

## 2. Fibonacci DP

**ファイル:** `src/problems/fibonacci.ts` | **関数:** `problem2_fib_dp()`

### アルゴリズム

ボトムアップ DP。線形メモリをテーブルとして使用。
- `mem[0] = 0`, `mem[4] = 1`
- n ≤ 1 → `mem[n*4]` を返す
- i = 2..n: `mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]`

### Wasm Export

```
fib(n: i32) → i32
```

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `fib(i)` | 4 (i32) |

Memory pages: 1 (64KB)

### DSL の見どころ

- `Mem.i32Array()` で配列アクセスの `.mul(4)` を隠蔽
- `Ctrl.for(i, 2, i.le(n), ...)` でループセレモニーを排除

---

## 3. Kadane's Algorithm

**ファイル:** `src/problems/kadane.ts` | **関数:** `problem3_kadane()`

### アルゴリズム

最大部分配列和。
- `current_sum = max_sum = mem[BASE]`
- i = 1..len-1: `current_sum = max(val, current_sum + val)`, `max_sum = max(max_sum, current_sum)`

### Wasm Export

```
kadane(len: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| 配列 | `1024 + i * 4` | `arr[i]` |

BASE = 1024。Memory pages: 2。

### DSL の見どころ

- `Mem.i32Array(BASE)` でオフセット付き配列アクセス
- `Ctrl.for` でメインループ、`Ctrl.if` で max 判定

---

## 4. Coin Change

**ファイル:** `src/problems/coin-change.ts` | **関数:** `problem4_coin_change()`

### アルゴリズム

最小コイン枚数 DP（無限個）。
- `dp[0] = 0`, `dp[1..amount] = INF`
- 各コイン j → 各金額 i: `dp[i] = min(dp[i], dp[i-coin]+1)`

### Wasm Export

```
coin_change(amount: i32, num_coins: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| DP テーブル | `i * 4` | `dp[i]` |
| コイン配列 | `2048 + j * 4` | `coins[j]` |

Memory pages: 2。

### DSL の見どころ

- `Mem.i32Array()` / `Mem.i32Array(COIN_BASE)` で DP テーブルとコイン配列を分離
- `Ctrl.for` による 2 重ループ、`Ctrl.when` で条件付き更新

---

## 5. Binary Search

**ファイル:** `src/problems/binary-search.ts` | **関数:** `problem5_binary_search()`

### アルゴリズム

ソート済み配列の二分探索。
- `lo = 0`, `hi = len - 1`
- ループ: `mid = (lo + hi) / 2`, `val = mem[mid*4]`

### Wasm Export

```
binary_search(len: i32, target: i32) → i32
```

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `arr[i]` | 4 (i32) |

Memory pages: 1。

### DSL の見どころ

- `Ctrl.while(lo.le(hi), ...)` で探索ループを自然に表現
- `local(Type.i32, 0)` で宣言と初期化を統合
- `Mem.i32Array()` でバイトアドレス計算を隠蔽

---

## 6. GCD Array

**ファイル:** `src/problems/gcd.ts` | **関数:** `problem6_gcd_array()`

### アルゴリズム

ユークリッド互除法を配列全体に適用。
- 内部関数 `gcd_fn(a, b)`: while b≠0 → a,b = b, a%b
- `array_gcd(len)`: `result = mem[0]`, i = 1..len-1: `result = gcd(result, mem[i*4])`

### Wasm Export

```
array_gcd(len: i32) → i32
```

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `arr[i]` | 4 (i32) |

Memory pages: 1。

### DSL の見どころ

- 複数 `Mod.func()` による内部関数 + エクスポート関数の分離
- `Op.rem` による剰余の tight loop
- `Ctrl.while(b.ne(0), ...)` でユークリッド互除法の while ループ
- `Ctrl.for` で配列スキャンループ
- `Mem.i32Array()` で配列アクセス

---

## 7. Sieve of Eratosthenes

**ファイル:** `src/problems/sieve.ts` | **関数:** `problem7_sieve()`

### アルゴリズム

エラトステネスの篩。
- `mem[i]` = 1byte フラグ（`Mem.load8` / `Mem.store8`）
- p = 2 〜 √n: p が素数なら p² から n まで p 刻みで 0 にマーク
- 2 〜 n でフラグが 1 の数をカウント

### Wasm Export

```
sieve(n: i32) → i32  (素数の個数)
```

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i` | 素数フラグ | 1 (byte) |

Memory pages: 2（最大 ~131,000 まで対応）。

### DSL の見どころ

- `Mem.load8` / `Mem.store8` — byte-level メモリ操作の実用例
- `i.mul(i).le(n)` — p*p≤n 条件
- `Ctrl.for` で 4 つのループ（初期化、篩い、カウント）を自然に表現
- `Ctrl.when` で void 条件分岐の `.then()` ラッパを排除

---

## 8. Matrix Multiply

**ファイル:** `src/problems/matmul.ts` | **関数:** `problem8_matmul()`

### アルゴリズム

素朴な 3 重ループ行列積（n×n 正方行列）。
- A at offset 0, B at n²×4, C at 2n²×4
- C[i][j] = Σ A[i][k] * B[k][j]

### Wasm Export

```
matmul(n: i32) → i32  (C[0][0] を検証用に返す)
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| A | `(i*n+j) * 4` | A[i][j] |
| B | `n²*4 + (i*n+j)*4` | B[i][j] |
| C | `2*n²*4 + (i*n+j)*4` | C[i][j] |

Memory pages: 2（n ≤ 64）。

### DSL の見どころ

- `Ctrl.for` による 3 重ネストループ（i, j, k）
- row-major 2D アドレス計算（動的ベースのため `Mem.i32Array` は未使用）

---

## 9. LCS Length

**ファイル:** `src/problems/lcs.ts` | **関数:** `problem9_lcs()`

### アルゴリズム

最長共通部分列の長さを 2 次元 DP で計算。
- A at 0, B at 1024, DP at 2048
- `dp[i][j]` = A[i-1]==B[j-1] ? dp[i-1][j-1]+1 : max(dp[i-1][j], dp[i][j-1])

### Wasm Export

```
lcs(len_a: i32, len_b: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| A | `i * 4` | A[i] |
| B | `1024 + j * 4` | B[j] |
| DP | `2048 + (i*(n+1)+j)*4` | dp[i][j] |

Memory pages: 5。

### DSL の見どころ

- `Ctrl.for` による 4 重ループ（初期化 × 2、メイン i, j）
- `Mem.i32Array()` で A / B / DP テーブルへの型付きアクセス
- `local(Type.i32, len_b.add(1))` で cols を宣言と同時に初期化

---

## 10. 0/1 Knapsack

**ファイル:** `src/problems/knapsack.ts` | **関数:** `problem10_knapsack()`

### アルゴリズム

0/1 ナップサック。1D DP（逆順ループ）で各アイテムを 1 回だけ使用。
- `dp[w]` = 容量 w での最大価値
- 各アイテム i: w = cap..wi: `dp[w] = max(dp[w], dp[w-wi]+vi)`

### Wasm Export

```
knapsack(n: i32, W: i32) → i32  (最大価値)
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| weights | `i * 4` | weight[i] |
| values | `4096 + i * 4` | value[i] |
| DP | `8192 + w * 4` | dp[w] |

Memory pages: 4。

### DSL の見どころ

- `Ctrl.for(w, cap, w.ge(wi), w.sub(1), ...)` — 逆順ループも Ctrl.for で自然に表現
- `Mem.i32Array()` で weights / values / DP の 3 配列を分離
- `Ctrl.when` で条件付き DP 更新

---

## 11. Quicksort

**ファイル:** `src/problems/quicksort.ts` | **関数:** `problem11_quicksort()`

### アルゴリズム

Lomuto partition + 再帰クイックソート。
- `partition(lo, hi)`: pivot = mem[hi*4]、i32 swap
- `quicksort(lo, hi)`: partition して左右を再帰ソート

### Wasm Export

```
quicksort(lo: i32, hi: i32) → i32  (partition 回数)
```

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `arr[i]` | 4 (i32) |

Memory pages: 1。

### DSL の見どころ

- `Ctrl.for` で partition ループ、`Ctrl.when` で swap 条件
- `Mem.i32Array()` で配列アクセスの `.mul(4)` を排除
- `let quicksort: CallableFunc` による再帰前方宣言（変更なし）

---

## 12. Flood Fill

**ファイル:** `src/problems/flood-fill.ts` | **関数:** `problem12_flood_fill()`

### アルゴリズム

BFS による塗りつぶし。線形メモリ上でキューを実装。
- Grid at offset 0 (W×H×4), Queue at W×H×4
- 4 方向（右・左・下・上）を展開、バウンドチェック後にメモリアクセス

### Wasm Export

```
flood_fill(W: i32, H: i32, sx: i32, sy: i32, target: i32, fill: i32) → i32  (塗りつぶしセル数)
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| Grid | `(y*W+x) * 4` | cell value |
| Queue | `W*H*4 + idx*4` | BFS (x,y) ペア |

Memory pages: 4。

### DSL の見どころ

- `Ctrl.while(head.lt(tail), ...)` で BFS メインループ
- `Ctrl.for` で 4 方向展開ループ
- `Ctrl.when` で境界チェック + 塗りつぶし条件

---

## 13. LIS (Longest Increasing Subsequence)

**ファイル:** `src/problems/lis.ts` | **関数:** `problem13_lis()`

### アルゴリズム

patience sort + lower_bound による O(n log n) LIS。
- `tails[]` 配列を線形メモリ上に管理
- 各要素に対して二分探索で挿入位置を決定

### Wasm Export

```
lis(len: i32) → i32  (LIS 長)
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| input | `i * 4` | arr[i] |
| tails | `16384 + i * 4` | tails[i] |

Memory pages: 1。

### DSL の見どころ

- `Ctrl.for` + `Ctrl.while` で外側ループ＋二分探索を表現
- `Mem.i32Array()` / `Mem.i32Array(TAILS_BASE)` で input と tails を分離
- `local(Type.i32, 0)` で tails_len の初期化

---

## 14. N-Queens Count

**ファイル:** `src/problems/nqueens.ts` | **関数:** `problem14_nqueens()`

### アルゴリズム

バックトラッキング再帰 + ビットマスクによる N-Queens 解の数え上げ。
- `solve(n, row, cols, diag1, diag2)`: 列・対角のビットマスクで衝突判定
- row == n に到達で解を 1 カウント

### Wasm Export

```
nqueens(n: i32) → i32  (解の総数)
```

### メモリレイアウト

Memory pages: 1（ほぼ不使用、ローカル変数のみ）。

### テストケース

| n | 期待値 |
|---|--------|
| 1 | 1 |
| 4 | 2 |
| 5 | 10 |
| 8 | 92 |
| 10 | 724 |
| 12 | 14,200 |

### DSL の見どころ

- `Ctrl.for` で列スキャン、`Ctrl.when` で配置可能判定
- `local(Type.i32, 0)` でカウンタ初期化
- `let solve: CallableFunc` による再帰前方宣言（変更なし）

---

## 15. Union-Find

**ファイル:** `src/problems/union-find.ts` | **関数:** `problem15_union_find()`

### アルゴリズム

Disjoint Set Union (DSU) with path compression + union by rank。
- `uf_init(n)`: parent[i] = i, rank[i] = 0, count = n
- `uf_find(x)`: root 探索 + path compression
- `uf_union(u, v)`: union by rank + count 減算
- `uf_count()`: 連結成分数を返す

### Wasm Export

```
uf_init(n: i32) → void
uf_union(u: i32, v: i32) → void
uf_find(x: i32) → i32
uf_count() → i32
```

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| parent | `i * 4` | parent[i] |
| rank | `32768 + i * 4` | rank[i] |
| count | `65532` | 連結成分数 |

Memory pages: 2。

### DSL の見どころ

- 4 つの export 関数 — Wasm モジュールが「オブジェクト」として機能
- ステートフルなデータ構造（状態がメモリに永続化）
- `Ctrl.for` で init ループ
- `Ctrl.while` で find の path compression ループ
- `Mem.i32Array()` / `Mem.i32Array(RANK_BASE)` で parent と rank を分離
- `Ctrl.when` で rank 比較条件
