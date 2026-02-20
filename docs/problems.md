# Problems

16 のアルゴリズム問題 + 10 の Realworld Example のカタログ。各問題は `showcase/examples/problems/` に、Realworld 例は `showcase/examples/realworld/` に実装され、`compile()` で Wasm バイナリに変換されます。

---

## 1. Tower of Hanoi

**ファイル:** `showcase/examples/problems/hanoi.ts` | **関数:** `problem1_hanoi()`

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

- `Mod.recursive(self => ...)` による自己参照再帰（前方宣言不要）
- `effect_move.void()` による void import 呼び出し
- `return 0` / `return count1.add(1).add(count2)` — 暗黙の return coercion

---

## 2. Fibonacci DP

**ファイル:** `showcase/examples/problems/fibonacci.ts` | **関数:** `problem2_fib_dp()`

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

| アドレス | 内容     | バイト幅 |
| -------- | -------- | -------- |
| `i * 4`  | `fib(i)` | 4 (i32)  |

Memory pages: 1 (64KB)

### DSL の見どころ

- `Mem.i32Array()` で配列アクセスの `.mul(4)` を隠蔽
- `Ctrl.for(i, 2, i.le(n), ...)` でループセレモニーを排除

---

## 3. Kadane's Algorithm

**ファイル:** `showcase/examples/problems/kadane.ts` | **関数:** `problem3_kadane()`

### アルゴリズム

最大部分配列和。

- `current_sum = max_sum = mem[BASE]`
- i = 1..len-1: `current_sum = max(val, current_sum + val)`, `max_sum = max(max_sum, current_sum)`

### Wasm Export

```
kadane(len: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス       | 内容     |
| ---- | -------------- | -------- |
| 配列 | `1024 + i * 4` | `arr[i]` |

BASE = 1024。Memory pages: 2。

### DSL の見どころ

- `Mem.i32Array(BASE)` でオフセット付き配列アクセス
- `Op.max(current_sum.add(v), v)` — branchless な値選択（if/else 4行 → 1式）
- `Ctrl.for` でメインループ

---

## 4. Coin Change

**ファイル:** `showcase/examples/problems/coin-change.ts` | **関数:** `problem4_coin_change()`

### アルゴリズム

最小コイン枚数 DP（無限個）。

- `dp[0] = 0`, `dp[1..amount] = INF`
- 各コイン j → 各金額 i: `dp[i] = min(dp[i], dp[i-coin]+1)`

### Wasm Export

```
coin_change(amount: i32, num_coins: i32) → i32
```

### メモリレイアウト

| 領域        | アドレス       | 内容       |
| ----------- | -------------- | ---------- |
| DP テーブル | `i * 4`        | `dp[i]`    |
| コイン配列  | `2048 + j * 4` | `coins[j]` |

Memory pages: 2。

### DSL の見どころ

- `Mem.i32Array()` / `Mem.i32Array(COIN_BASE)` で DP テーブルとコイン配列を分離
- `Op.select(dp.load(amount).eq(INF), -1, dp.load(amount))` — 条件付き戻り値を1式で
- `Ctrl.for` による 2 重ループ、`Ctrl.when` で条件付き更新

---

## 5. Binary Search

**ファイル:** `showcase/examples/problems/binary-search.ts` | **関数:** `problem5_binary_search()`

### アルゴリズム

ソート済み配列の二分探索。

- `lo = 0`, `hi = len - 1`
- ループ: `mid = (lo + hi) / 2`, `val = mem[mid*4]`

### Wasm Export

```
binary_search(len: i32, target: i32) → i32
```

### メモリレイアウト

| アドレス | 内容     | バイト幅 |
| -------- | -------- | -------- |
| `i * 4`  | `arr[i]` | 4 (i32)  |

Memory pages: 1。

### DSL の見どころ

- `Ctrl.while(lo.le(hi), ...)` で探索ループを自然に表現
- `local(Type.i32, 0)` で宣言と初期化を統合
- `Mem.i32Array()` でバイトアドレス計算を隠蔽

---

## 6. GCD Array

**ファイル:** `showcase/examples/problems/gcd.ts` | **関数:** `problem6_gcd_array()`

### アルゴリズム

ユークリッド互除法を配列全体に適用。

- 内部関数 `gcd_fn(a, b)`: while b≠0 → a,b = b, a%b
- `array_gcd(len)`: `result = mem[0]`, i = 1..len-1: `result = gcd(result, mem[i*4])`

### Wasm Export

```
array_gcd(len: i32) → i32
```

### メモリレイアウト

| アドレス | 内容     | バイト幅 |
| -------- | -------- | -------- |
| `i * 4`  | `arr[i]` | 4 (i32)  |

Memory pages: 1。

### DSL の見どころ

- 複数 `Mod.func()` による内部関数 + エクスポート関数の分離
- `Op.rem` による剰余の tight loop
- `Ctrl.while(b.ne(0), ...)` でユークリッド互除法の while ループ
- `Ctrl.for` で配列スキャンループ
- `Mem.i32Array()` で配列アクセス

---

## 7. Sieve of Eratosthenes

**ファイル:** `showcase/examples/problems/sieve.ts` | **関数:** `problem7_sieve()`

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

| アドレス | 内容       | バイト幅 |
| -------- | ---------- | -------- |
| `i`      | 素数フラグ | 1 (byte) |

Memory pages: 2（最大 ~131,000 まで対応）。

### DSL の見どころ

- `Mem.load8` / `Mem.store8` — byte-level メモリ操作の実用例
- `i.mul(i).le(n)` — p\*p≤n 条件
- `Ctrl.for` で 4 つのループ（初期化、篩い、カウント）を自然に表現
- `Ctrl.when` で void 条件分岐の `.then()` ラッパを排除

---

## 8. Matrix Multiply

**ファイル:** `showcase/examples/problems/matmul.ts` | **関数:** `problem8_matmul()`

### アルゴリズム

素朴な 3 重ループ行列積（n×n 正方行列）。

- A at offset 0, B at n²×4, C at 2n²×4
- C[i][j] = Σ A[i][k] \* B[k][j]

### Wasm Export

```
matmul(n: i32) → i32  (C[0][0] を検証用に返す)
```

### メモリレイアウト

| 領域 | アドレス             | 内容    |
| ---- | -------------------- | ------- |
| A    | `(i*n+j) * 4`        | A[i][j] |
| B    | `n²*4 + (i*n+j)*4`   | B[i][j] |
| C    | `2*n²*4 + (i*n+j)*4` | C[i][j] |

Memory pages: 2（n ≤ 64）。

### DSL の見どころ

- `Mem.i32Array2D(0, n)` で A 行列の 2D アクセス（`A.load(i, k)` で `(i*n+k)*4` を隠蔽）
- `Ctrl.for` による 3 重ネストループ（i, j, k）
- B / C は動的ベース（`nn*4`, `nn*8`）のため raw `Mem.load/store` を使用

---

## 9. LCS Length

**ファイル:** `showcase/examples/problems/lcs.ts` | **関数:** `problem9_lcs()`

### アルゴリズム

最長共通部分列の長さを 2 次元 DP で計算。

- A at 0, B at 1024, DP at 2048
- `dp[i][j]` = A[i-1]==B[j-1] ? dp[i-1][j-1]+1 : max(dp[i-1][j], dp[i][j-1])

### Wasm Export

```
lcs(len_a: i32, len_b: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス               | 内容     |
| ---- | ---------------------- | -------- |
| A    | `i * 4`                | A[i]     |
| B    | `1024 + j * 4`         | B[j]     |
| DP   | `2048 + (i*(n+1)+j)*4` | dp[i][j] |

Memory pages: 5。

### DSL の見どころ

- `Mem.i32Array2D(DP_BASE, cols)` で 2D DP テーブルへのアクセス（`dp.load(i, j)` で `i.mul(cols).add(j)` を隠蔽）
- `Op.max(dp.load(i.sub(1), j), dp.load(i, j.sub(1)))` — nested if/else 15行 → 1式
- `Mem.i32Array()` で A / B 配列への型付きアクセス
- `local(Type.i32, len_b.add(1))` で cols を宣言と同時に初期化

---

## 10. 0/1 Knapsack

**ファイル:** `showcase/examples/problems/knapsack.ts` | **関数:** `problem10_knapsack()`

### アルゴリズム

0/1 ナップサック。1D DP（逆順ループ）で各アイテムを 1 回だけ使用。

- `dp[w]` = 容量 w での最大価値
- 各アイテム i: w = cap..wi: `dp[w] = max(dp[w], dp[w-wi]+vi)`

### Wasm Export

```
knapsack(n: i32, W: i32) → i32  (最大価値)
```

### メモリレイアウト

| 領域    | アドレス       | 内容      |
| ------- | -------------- | --------- |
| weights | `i * 4`        | weight[i] |
| values  | `4096 + i * 4` | value[i]  |
| DP      | `8192 + w * 4` | dp[w]     |

Memory pages: 4。

### DSL の見どころ

- `Op.max(dp.load(w), dp.load(w.sub(wi)).add(vi))` — branchless な DP 更新
- `Ctrl.for(w, cap, w.ge(wi), w.sub(1), ...)` — 逆順ループも Ctrl.for で自然に表現
- `Mem.i32Array()` で weights / values / DP の 3 配列を分離

---

## 11. Quicksort

**ファイル:** `showcase/examples/problems/quicksort.ts` | **関数:** `problem11_quicksort()`

### アルゴリズム

Lomuto partition + 再帰クイックソート。

- `partition(lo, hi)`: pivot = mem[hi*4]、i32 swap
- `quicksort(lo, hi)`: partition して左右を再帰ソート

### Wasm Export

```
quicksort(lo: i32, hi: i32) → void
```

### メモリレイアウト

| アドレス | 内容     | バイト幅 |
| -------- | -------- | -------- |
| `i * 4`  | `arr[i]` | 4 (i32)  |

Memory pages: 1。

### DSL の見どころ

- `arr.swap(i, j, tmp)` — 3行の swap パターンを1行で
- `Ctrl.for` で partition ループ、`Ctrl.when` で swap 条件
- `Mem.i32Array()` で配列アクセスの `.mul(4)` を排除
- `Mod.recursive` による自己参照再帰（前方宣言不要）
- `i.incrBy(1)` — 複合代入で partition の `i = i + 1` を簡潔に

---

## 12. Flood Fill

**ファイル:** `showcase/examples/problems/flood-fill.ts` | **関数:** `problem12_flood_fill()`

### アルゴリズム

BFS による塗りつぶし。線形メモリ上でキューを実装。

- Grid at offset 0 (W×H×4), Queue at W×H×4
- 4 方向（右・左・下・上）を展開、バウンドチェック後にメモリアクセス

### Wasm Export

```
flood_fill(W: i32, H: i32, sx: i32, sy: i32, target: i32, fill: i32) → i32  (塗りつぶしセル数)
```

### メモリレイアウト

| 領域  | アドレス        | 内容           |
| ----- | --------------- | -------------- |
| Grid  | `(y*W+x) * 4`   | cell value     |
| Queue | `W*H*4 + idx*4` | BFS (x,y) ペア |

Memory pages: 4。

### DSL の見どころ

- `Ctrl.switch(d).case(0, ...).case(1, ...)...` — 4方向分岐をビルダパターンで宣言的に（nested if/else 22行 → 6行）
- `Ctrl.while(head.lt(tail), ...)` で BFS メインループ
- `Ctrl.for` で 4 方向展開ループ
- `Ctrl.when` で境界チェック + 塗りつぶし条件

---

## 13. LIS (Longest Increasing Subsequence)

**ファイル:** `showcase/examples/problems/lis.ts` | **関数:** `problem13_lis()`

### アルゴリズム

patience sort + lower_bound による O(n log n) LIS。

- `tails[]` 配列を線形メモリ上に管理
- 各要素に対して二分探索で挿入位置を決定

### Wasm Export

```
lis(len: i32) → i32  (LIS 長)
```

### メモリレイアウト

| 領域  | アドレス        | 内容     |
| ----- | --------------- | -------- |
| input | `i * 4`         | arr[i]   |
| tails | `16384 + i * 4` | tails[i] |

Memory pages: 1。

### DSL の見どころ

- `Ctrl.for` + `Ctrl.while` で外側ループ＋二分探索を表現
- `Mem.i32Array()` / `Mem.i32Array(TAILS_BASE)` で input と tails を分離
- `local(Type.i32, 0)` で tails_len の初期化

---

## 14. N-Queens Count

**ファイル:** `showcase/examples/problems/nqueens.ts` | **関数:** `problem14_nqueens()`

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

| n   | 期待値 |
| --- | ------ |
| 1   | 1      |
| 4   | 2      |
| 5   | 10     |
| 8   | 92     |
| 10  | 724    |
| 12  | 14,200 |

### DSL の見どころ

- `Ctrl.for` で列スキャン、`Ctrl.when` で配置可能判定
- `local(Type.i32, 0)` でカウンタ初期化
- `Mod.recursive` による自己参照再帰（前方宣言不要）
- `i32(1).shl(col)` — トップレベル `i32()` でビットマスク生成
- `count.incrBy(...)` — 複合代入で解のカウントアップ

---

## 15. Union-Find

**ファイル:** `showcase/examples/problems/union-find.ts` | **関数:** `problem15_union_find()`

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

| 領域   | アドレス        | 内容       |
| ------ | --------------- | ---------- |
| parent | `i * 4`         | parent[i]  |
| rank   | `32768 + i * 4` | rank[i]    |
| count  | `65532`         | 連結成分数 |

Memory pages: 2。

### DSL の見どころ

- `Mod.exportAll({ uf_init, uf_find, uf_union, uf_count })` — 4 export を1行で
- 4 つの export 関数 — Wasm モジュールが「オブジェクト」として機能
- ステートフルなデータ構造（状態がメモリに永続化）
- `Ctrl.for` で init ループ
- `Ctrl.while` で find の path compression ループ
- `Mem.i32Array()` / `Mem.i32Array(RANK_BASE)` で parent と rank を分離
- `Ctrl.when` で rank 比較条件

---

## 16. Edit Distance (Levenshtein)

**ファイル:** `showcase/examples/problems/edit-distance.ts` | **関数:** `problem16_edit_distance()`

### アルゴリズム

Levenshtein 編集距離を 2D DP で計算。

- A at offset 0 (i32 array), B at offset 4096, DP at offset 8192
- `dp[i][j] = min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (A[i-1]!=B[j-1]))`

### Wasm Export

```
editDistance(len_a: i32, len_b: i32) → i32
```

### メモリレイアウト

| 領域 | アドレス               | 内容     |
| ---- | ---------------------- | -------- |
| A    | `i * 4`                | A[i]     |
| B    | `4096 + j * 4`         | B[j]     |
| DP   | `8192 + (i*(n+1)+j)*4` | dp[i][j] |

Memory pages: 10。

### DSL の見どころ

- `Mem.i32Array2D(DP_BASE, cols)` で 2D DP テーブルアクセス
- `Op.min` のネストで 3 方向の最小値を計算
- `Ctrl.range` による 2 重ループ
- `Ctrl.if().then().else()` で match/mismatch コスト分岐

---

# Realworld Examples

`showcase/examples/realworld/` に配置された実用ユースケース。ブラウザ UI でインタラクティブデモとして動作する。

---

## R1. Image Grayscale + Brightness

**ファイル:** `showcase/examples/realworld/grayscale.ts`

### 機能

- `grayscale(len)`: RGBA ピクセルを in-place でグレースケール変換。ITU-R BT.601 整数近似 `gray = (77*R + 150*G + 29*B) >> 8`
- `brightness(len, delta)`: 各 RGB チャンネルに delta を加算、`Op.max/Op.min` で 0-255 にクランプ

### メモリレイアウト

| アドレス | 内容            | バイト幅 |
| -------- | --------------- | -------- |
| `i * 4`  | pixel[i] (RGBA) | 4 bytes  |

Memory pages: 1 (16384 pixels)。

### DSL の見どころ

- `Mem.load8` / `Mem.store8` — バイト単位の RGBA チャンネル操作
- `Op.max(Op.min(val, 255), 0)` — ブランチレスクランプ
- 2 つの export 関数を 1 モジュールで提供

---

## R2. CRC32 Checksum

**ファイル:** `showcase/examples/realworld/crc32.ts`

### 機能

- `crc32(dataOffset, len)`: IEEE 802.3 CRC32 チェックサム計算

### メモリレイアウト

| 領域     | アドレス   | 内容                          |
| -------- | ---------- | ----------------------------- |
| テーブル | `0 - 1023` | CRC32 lookup table (256 x 4B) |
| データ   | `1024+`    | 入力データ                    |

Memory pages: 1。

### DSL の見どころ

- `Mod.data(0, tableBytes)` — JS 側で生成した 1024 バイトのルックアップテーブルを data segment に埋め込み
- `Op.shr_u(crc, 8)` — 符号なし右シフト（`>>>` 相当）
- `crc.xor(-1)` — i32 の -1 は 0xFFFFFFFF

---

## R3. Conway's Game of Life

**ファイル:** `showcase/examples/realworld/game-of-life.ts`

### 機能

- `step(w, h)`: 1 世代進める（ダブルバッファリング）
- `getCell(x, y, w)`: セル状態を読み取り

### メモリレイアウト

| 領域   | アドレス        | 内容                     |
| ------ | --------------- | ------------------------ |
| Grid A | `0 - w*h-1`     | 現在の世代 (1 byte/cell) |
| Grid B | `w*h - 2*w*h-1` | 次世代バッファ           |

Memory pages: 2。

### DSL の見どころ

- 4 重ネスト `Ctrl.for`（y, x, dy, dx）で 8 方向近傍カウント
- `count.eq(3).or(cell.and(count.eq(2)))` — ブランチレスな alive 判定（Conway のルールを 1 式で表現）
- ダブルバッファ: gridB に書き込み → gridA にコピーで世代更新

---

## R4. 2D Particle Simulation

**ファイル:** `showcase/examples/realworld/particles.ts`

### 機能

- `step(n, dt)`: 位置更新 `x += vx*dt, y += vy*dt`
- `applyGravity(n, gx, gy)`: 重力加速 `vx += gx, vy += gy`
- `bounce(n, w, h)`: 壁反射（完全弾性、速度反転 + 位置クランプ）

### メモリレイアウト

`Particle = Struct({ x: "f64", y: "f64", vx: "f64", vy: "f64" })` — 32 bytes/particle。`BumpAllocator` で最大 1000 粒子分を割り当て。

### DSL の見どころ

- `Struct` + `BumpAllocator` で構造化メモリレイアウトを型安全に管理
- `f64` 全フィールド + `Op.f64.neg` で速度反転
- `Ctrl.when` で 4 壁の条件分岐（左・右・上・下）
- JS 側は `Float64Array` ビューで直接読み書き

---

## R5. Sepia Tone Filter

**ファイル:** `showcase/examples/realworld/sepia.ts`

### 機能

- `sepia(len)`: RGBA ピクセルを in-place でセピア調に変換。固定小数点行列演算（×256 + `>> 8`）

### メモリレイアウト

| アドレス | 内容            | バイト幅 |
| -------- | --------------- | -------- |
| `i * 4`  | pixel[i] (RGBA) | 4 bytes  |

Memory pages: 1。

### DSL の見どころ

- `Meta.each` で出力チャンネル（R, G, B）をイテレーション
- `Meta.weightedSum` でセピア行列の行×RGB ベクトルを 1 式で計算
- `RGBA.at(offset)` でピクセルフィールドアクセス
- 固定小数点: `shr(8)` で 256 スケーリングを除去

---

## R6. 3×3 Image Convolution

**ファイル:** `showcase/examples/realworld/convolution.ts`

### 機能

- `convolve(w, h, divisor)`: 3×3 カーネル畳み込み（blur / sharpen / edge detect）

### メモリレイアウト

| 領域   | アドレス    | 内容               |
| ------ | ----------- | ------------------ |
| input  | `0`         | RGBA ピクセル      |
| output | `w * h * 4` | 出力 RGBA ピクセル |

Memory pages: 2。

### DSL の見どころ

- `Meta.weightedSum` で 3×3 カーネル係数の累積を compile-time 展開
- `Meta.each` でチャンネルイテレーション + カーネル 2D 展開
- `RGBA.at()` による入出力ピクセル操作
- カーネル定数はすべて JS 側で定義（`KERNELS.blur`, `KERNELS.sharpen`, `KERNELS.edge`）

---

## R7. Grayscale Histogram

**ファイル:** `showcase/examples/realworld/histogram.ts`

### 機能

- `histogram(len)`: グレースケール画像から 256 バケットヒストグラムを計算
- `histogramRgba(len)`: RGBA 画像を BT.601 輝度に変換してヒストグラム計算
- `cdf()`: 累積分布関数を前方和で計算

### メモリレイアウト

| 領域         | アドレス | 内容                      |
| ------------ | -------- | ------------------------- |
| ピクセル     | `0`      | グレースケール (1B/pixel) |
| ヒストグラム | `65536`  | 256 × i32                 |
| CDF          | `66560`  | 256 × i32                 |

Memory pages: 2。

### DSL の見どころ

- `Meta.weightedSum` で BT.601 グレースケール計算
- `Mem.i32Array().at(idx).incrBy(1)` でヒストグラムバケットのインクリメント
- `Meta.times(256, ...)` で compile-time ヒストグラムクリア

---

## R8. Histogram Equalization

**ファイル:** `showcase/examples/realworld/histogram-equalization.ts`

### 機能

- `equalize(len)`: RGBA 画像のコントラストをヒストグラム均等化で自動調整

### アルゴリズム

1. BT.601 重みでグレースケールヒストグラムを構築
2. 前方和で CDF を計算
3. 各ピクセルをリマップ: `newGray = (cdf[gray] - cdfMin) * 255 / (total - cdfMin)`

### メモリレイアウト

| 領域          | アドレス | 内容      |
| ------------- | -------- | --------- |
| RGBA ピクセル | `0`      | in-place  |
| ヒストグラム  | `65536`  | 256 × i32 |
| CDF           | `66560`  | 256 × i32 |

Memory pages: 4。

### DSL の見どころ

- `RGBA.at(offset)` でピクセル操作
- `Meta.weightedSum` で輝度計算
- `Op.div_u` で符号なし除算（均等化マッピング）
- `Ctrl.range` で 3 つのパス（ヒストグラム構築 → CDF → リマップ）

---

## R9. Binary Morphology (Erode / Dilate)

**ファイル:** `showcase/examples/realworld/erode-dilate.ts`

### 機能

- `erode(w, h)`: 収縮演算（3×3 近傍がすべて 1 なら 1）
- `dilate(w, h)`: 膨張演算（3×3 近傍にひとつでも 1 があれば 1）

### メモリレイアウト

| 領域   | アドレス | 内容               |
| ------ | -------- | ------------------ |
| input  | `0`      | byte grid (0/1 値) |
| output | `w * h`  | byte grid (結果)   |

### DSL の見どころ

- `Mem.byteGrid(0, w)` / `Mem.byteGrid(gridSize, w)` で入出力グリッド
- 3×3 カーネルを JS 配列 + `Meta.each` で compile-time 展開
- `Mem.store8` / `Mem.load8` で byte-level 操作
- 境界チェック付きの近傍走査

---

## R10. Maze BFS (Shortest Path)

**ファイル:** `showcase/examples/realworld/maze-bfs.ts`

### 機能

- `solve(w, h, sx, sy, gx, gy)`: グリッド迷路の最短経路長（BFS）。到達不能なら -1

### メモリレイアウト

| 領域     | アドレス      | 内容                     |
| -------- | ------------- | ------------------------ |
| maze     | `0`           | byte grid (0=通路, 1=壁) |
| distance | `w*h`         | i32 grid (-1=未訪問)     |
| queue    | `w*h + w*h*4` | i32 BFS キュー           |

Memory pages: 10。

### DSL の見どころ

- `Queue(qBase)` で BFS キューを生成（head/tail 自動管理）
- `Meta.neighbors4` で 4 方向展開
- `Mem.byteGrid` + `Mem.i32Array2D` で異なる型のグリッドを同一モジュールで管理
- `Loc.return` で目標到達時の早期リターン
