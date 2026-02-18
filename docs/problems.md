# Problems

5 つのアルゴリズム問題のカタログ。各問題は `src/problems/` に実装され、`compileProblem()` で Wasm バイナリに変換されます。

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

ディスク移動を外部にコールバックする副作用関数。

### メモリレイアウト

メモリ不使用。

### ローカル変数

| Index | 種別 | 用途 |
|-------|------|------|
| 0 | param | n |
| 1 | param | from |
| 2 | param | to |
| 3 | param | aux |
| 4 | local | count1（前半の再帰結果） |
| 5 | local | count2（後半の再帰結果） |

### 関数インデックス

- 0: `effect_move`（import）
- 1: `hanoi`（ローカル、再帰呼び出しもこの index）

### テストケース

| 入力 | 期待値 |
|------|--------|
| `hanoi(4, 1, 3, 2)` | 15 moves, 15 effect events |

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

### Import

なし。

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `fib(i)` | 4 (i32) |

Memory pages: 1 (64KB)

### ローカル変数

| Index | 種別 | 用途 |
|-------|------|------|
| 0 | param | n |
| 1 | local | i（ループカウンタ） |

### テストケース

| n | 期待値 |
|---|--------|
| 0 | 0 |
| 1 | 1 |
| 2 | 1 |
| 5 | 5 |
| 10 | 55 |
| 20 | 6765 |
| 30 | 832040 |

---

## 3. Kadane's Algorithm

**ファイル:** `src/problems/kadane.ts` | **関数:** `problem3_kadane()`

### アルゴリズム

最大部分配列和（Kadane's Algorithm）。
- `current_sum = max_sum = mem[BASE]`
- i = 1..len-1: `current_sum = max(val, current_sum + val)`, `max_sum = max(max_sum, current_sum)`

### Wasm Export

```
kadane(len: i32) → i32
```

### Import

なし。

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `1024 + i * 4` | `arr[i]` | 4 (i32) |

BASE = 1024。Memory pages: 2 (128KB)。

呼び出し側はメモリの `BASE / 4` オフセットから `Int32Array` で配列を書き込みます。

### ローカル変数

| Index | 種別 | 用途 |
|-------|------|------|
| 0 | param | len |
| 1 | local | i（ループカウンタ） |
| 2 | local | current_sum |
| 3 | local | max_sum |
| 4 | local | val（現在要素） |

### テストケース

| 配列 | 期待値 |
|------|--------|
| `[-2, 1, -3, 4, -1, 2, 1, -5, 4]` | 6 |
| `[1]` | 1 |
| `[-1, -2, -3]` | -1 |
| `[5, 4, -1, 7, 8]` | 23 |

---

## 4. Coin Change

**ファイル:** `src/problems/coin-change.ts` | **関数:** `problem4_coin_change()`

### アルゴリズム

最小コイン枚数を求める DP。
- `dp[0] = 0`, `dp[1..amount] = INF (0x7fffffff)`
- 各コイン j: 各金額 i (coin..amount): `dp[i] = min(dp[i], dp[i-coin]+1)`（ただし `dp[i-coin] < INF` のガード付き）
- 結果: `dp[amount] == INF ? -1 : dp[amount]`

### Wasm Export

```
coin_change(amount: i32, num_coins: i32) → i32
```

### Import

なし。

### メモリレイアウト

| 領域 | アドレス | 内容 |
|------|---------|------|
| DP テーブル | `i * 4` (i = 0..amount) | `dp[i]` |
| コイン配列 | `2048 + j * 4` | `coins[j]` |

COIN_BASE = 2048。INF = 0x7fffffff。Memory pages: 2 (128KB)。

呼び出し側は:
1. DP 領域をクリア
2. `COIN_BASE / 4` オフセットから `Int32Array` でコインを書き込み

### ローカル変数

| Index | 種別 | 用途 |
|-------|------|------|
| 0 | param | amount |
| 1 | param | num_coins |
| 2 | local | i（金額ループカウンタ） |
| 3 | local | j（コインループカウンタ） |
| 4 | local | coin（現在のコイン値） |
| 5 | local | tmp（`dp[i-coin] + 1`） |

### テストケース

| コイン | 金額 | 期待値 |
|--------|------|--------|
| `[1, 5, 10, 25]` | 30 | 2 |
| `[2]` | 3 | -1 |
| `[1, 2, 5]` | 11 | 3 |
| `[1]` | 0 | 0 |
| `[1, 5, 10]` | 27 | 5 |

---

## 5. Binary Search

**ファイル:** `src/problems/binary-search.ts` | **関数:** `problem5_binary_search()`

### アルゴリズム

標準的な二分探索。ソート済み配列を線形メモリに格納。
- `lo = 0`, `hi = len - 1`
- ループ: `mid = (lo + hi) / 2`, `val = mem[mid*4]`
  - `val == target` → return mid
  - `val < target` → `lo = mid + 1`
  - else → `hi = mid - 1`
- 見つからない → return -1

### Wasm Export

```
binary_search(len: i32, target: i32) → i32
```

### Import

なし。

### メモリレイアウト

| アドレス | 内容 | バイト幅 |
|---------|------|---------|
| `i * 4` | `arr[i]` | 4 (i32) |

Memory pages: 1 (64KB)。

呼び出し側は `Int32Array` でソート済み配列を先頭から書き込みます。

### ローカル変数

| Index | 種別 | 用途 |
|-------|------|------|
| 0 | param | len |
| 1 | param | target |
| 2 | local | lo |
| 3 | local | hi |
| 4 | local | mid |
| 5 | local | val（mid の値） |

### テストケース

配列: `[2, 5, 8, 12, 16, 23, 38, 56, 72, 91]`

| target | 期待値 |
|--------|--------|
| 23 | 5 |
| 2 | 0 |
| 91 | 9 |
| 50 | -1 |
| 12 | 3 |
