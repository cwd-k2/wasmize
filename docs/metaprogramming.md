# JS メタプログラミング

Generator ベースの DSL は JS ランタイム上でコンパイル時に実行される。
つまり **JS/TS はチューリング完全で OOP を備えた強力なプリプロセッサ** として機能する。

---

## 核心的な洞察

wasmize の DSL は Generator (`function*`) で Wasm 命令列を記述し、`compile()` が JS 側でそれを走査して IR → バイナリに変換する。この「Generator を駆動する」フェーズは完全に JS ランタイム上で動くため、Generator 内で JS のあらゆる機能が使える:

```
JS/TS の世界（コンパイル時）          Wasm の世界（実行時）
┌─────────────────────────┐        ┌──────────────────────┐
│ for, map, reduce        │        │ i32.add, i32.store   │
│ 配列, オブジェクト       │ ──→    │ block, loop, br_if   │
│ クロージャ, クラス       │ yield* │ local.get, local.set │
│ テンプレートリテラル     │        │ call, return         │
└─────────────────────────┘        └──────────────────────┘
```

**JS の `for` ループは Wasm のループにはならない。** JS ループ内で `yield*` された命令は、コンパイル時に展開（unroll）されて静的な命令列になる。実行時の Wasm バイナリにはループのオーバーヘッドは存在しない。

**この原理はループ展開に限らない。** JS のオブジェクト指向機能（クラス、Proxy、クロージャ）もコンパイル時の抽象化に使える。メモリレイアウト計算をオブジェクトに隠蔽したり、Generator ファクトリでローカル変数のスコープを閉じ込めたりできる。生成される Wasm にはこれらの抽象化の痕跡は残らない。

---

## パターン集

### 1. Config 配列 + for...of — 同一構造の N 方向展開

同じ処理パターンがパラメータだけ異なって繰り返される場合、config 配列を定義して JS の `for...of` で展開する。

**例: flood-fill の 4 方向チェック**

```typescript
// Before: 67行の手動展開
// Right: (cx+1, cy)
nx.set(cx.add(1)),
ny.set(cy),
Ctrl.when(nx.lt(W), () => [ /* 7行の共通処理 */ ]),
// Left: (cx-1, cy) — 同じ構造を繰り返し...
// Down: (cx, cy+1) — 同じ構造を繰り返し...
// Up: (cx, cy-1) — 同じ構造を繰り返し...

// After: config + ループで 20行
const dirs = [
  { dx: 1, dy: 0, check: () => nx.lt(W) },     // Right
  { dx: -1, dy: 0, check: () => nx.ge(0) },    // Left
  { dx: 0, dy: 1, check: () => ny.lt(H) },     // Down
  { dx: 0, dy: -1, check: () => ny.ge(0) },    // Up
];

for (const { dx, dy, check } of dirs) {
  yield* nx.set(cx.add(dx));
  yield* ny.set(cy.add(dy));
  yield* Ctrl.when(check(), () => [
    addr.set(ny.mul(W).add(nx).mul(4)),
    Ctrl.when(Mem.load8(addr).eq(target), () => [ /* 共通処理 */ ]),
  ]);
}
```

4 方向 × 同一構造 → 1 ループ。生成される Wasm は展開版と同一。

**例: Game of Life の 8 近傍カウント**

```typescript
// Before: Wasm 二重ループ + center skip 条件
yield *
  Ctrl.for(dy, -1, dy.le(1), dy.add(1), function* () {
    yield* Ctrl.for(dx, -1, dx.le(1), dx.add(1), function* () {
      yield* Ctrl.when(dx.ne(0).or(dy.ne(0)), function* () {
        /* ... */
      });
    });
  });

// After: JS 側でローカル定数を列挙（ドメイン固有の定数はファイルローカルに定義）
const NEIGHBORS_8 = [
  { dx: -1, dy: -1 }, { dx: -1, dy: 0 }, { dx: -1, dy: 1 },
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
  { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
];
for (const { dx, dy } of NEIGHBORS_8) {
  yield * ny.set(y.add(dy));
  yield * nx.set(x.add(dx));
  yield *
    Ctrl.when(ny.ge(0).and(ny.lt(h)).and(nx.ge(0)).and(nx.lt(w)), () => [
      count.incrBy(gridA.load(ny, nx)),
    ]);
}
```

Wasm レベルのループ 2 つ + skip 条件が消え、dx/dy ローカル変数も不要になる。

### 2. ファクトリ関数 — 共通パターンのパラメータ化

同一構造の DSL 関数が複数ある場合、JS の関数で共通部分を抽出する。

**例: array-stats の sum/max/min — Reduction ファクトリ**

```typescript
// Before: 3 関数 × ほぼ同じ body（42行）
sum: { body: function* (len) { /* for ループ + acc.incrBy(v) */ } },
max: { body: function* (len) { /* for ループ + acc.set(Op.max(acc, v)) */ } },
min: { body: function* (len) { /* for ループ + acc.set(Op.min(acc, v)) */ } },

// After: ファクトリで共通構造を抽出（20行）
function reduceFunc(startIdx, init, combine) {
  return {
    params: { len: "i32" as const },
    body: function* (len) {
      const i = yield* local(Type.i32);
      const acc = yield* local(Type.i32, init);
      yield* Ctrl.for(i, startIdx, i.lt(len), i.add(1), () => [
        combine(acc, arr.load(i)),
      ]);
      return acc;
    },
  };
}

functions: {
  sum: reduceFunc(0, 0, (acc, v) => acc.incrBy(v)),
  max: reduceFunc(1, arr.load(0), (acc, v) => acc.set(Op.max(acc, v))),
  min: reduceFunc(1, arr.load(0), (acc, v) => acc.set(Op.min(acc, v))),
}
```

初期値と集約演算だけが異なる 3 関数を、1 つのファクトリ + 3 つのワンライナーに圧縮。

### 3. 軸抽象化 — 文字列キーによる Struct フィールドアクセス

複数の軸（x/y）で同じ処理を行う場合、フィールド名を文字列で保持してループする。

**例: particles の壁反射ロジック**

```typescript
const axes = [
  { pos: "x", vel: "vx", coord: x, bound: w },
  { pos: "y", vel: "vy", coord: y, bound: h },
] as const;

for (const { pos, vel, coord, bound } of axes) {
  yield * coord.set(p[pos]);
  yield *
    Ctrl.when(coord.lt(f64(0)), function* () {
      yield* p[pos].set(coord.neg());
      yield* p[vel].set(p[vel].neg());
    });
  yield * coord.set(p[pos]); // reload
  yield *
    Ctrl.when(coord.gt(bound), function* () {
      yield* p[pos].set(bound.mul(f64(2)).sub(coord));
      yield* p[vel].set(p[vel].neg());
    });
}
```

x 軸の 4 壁チェック + y 軸の 4 壁チェック（29行）→ 1 ループ（19行）。

### 4. 単純チャンネルループ — 繰り返し store/load の圧縮

**例: grayscale の RGB 書き込み（RGBA プリセット使用）**

```typescript
// Before
yield * Mem.store8(offset, gray);
yield * Mem.store8(offset.add(1), gray);
yield * Mem.store8(offset.add(2), gray);

// After: RGBA プリセット + チャンネルループ
const px = RGBA.at(offset);
for (const ch of ["r", "g", "b"] as const) {
  yield * px[ch].set(gray);
}
```

---

## 注意事項

### Single-use 制約: Generator は一度しか消費できない

wasmize の式（`ChainableExpr`, `FieldAccessor`）は内部に Generator を持ち、**Generator は JS では一度しかイテレートできない**。これは DSL を使う上で最も重要な制約。

#### FieldAccessor のキャッシュは NG

`Struct.at(i)` が返す Proxy は、プロパティアクセスのたびに新しい `FieldAccessor` を生成する。

```typescript
// NG: FieldAccessor をキャッシュして複数回使用
const axes = [{ pos: p.x, vel: p.vx }]; // p.x を 1 度だけ取得
for (const { pos, vel } of axes) {
  yield * coord.set(pos); // (1) pos._inner を消費
  yield * coord.set(pos); // (2) 枯渇した Generator → undefined → TypeError!
}

// OK: 文字列キーで毎回フレッシュにアクセス
const axes = [{ pos: "x", vel: "vx" }] as const;
for (const { pos, vel } of axes) {
  yield * coord.set(p[pos]); // p["x"] → Proxy get → 新しい FieldAccessor
  yield * coord.set(p[pos]); // p["x"] → Proxy get → また新しい FieldAccessor
}
```

#### Struct.at() の base に ChainableExpr を渡すと壊れる

`RGBA.at(i.mul(4))` のように single-use な `ChainableExpr` を base に渡すと、2 番目以降のフィールドアクセスで消費済み Generator にアクセスして TypeError になる。

```typescript
// NG: ChainableExpr を直接 base に渡す
const px = RGBA.at(i.mul(4)); // i.mul(4) は single-use
yield * gray.set(px.r); // OK: r のアドレス計算で i.mul(4) を消費
yield * px.g; // NG: i.mul(4) は既に消費済み → TypeError!

// OK: ローカル変数に格納してから渡す
yield * offset.set(i.mul(4)); // WasmRef に格納
const px = RGBA.at(offset); // WasmRef は何度でも local_get を生成可能
yield * gray.set(px.r); // OK
yield * px.g; // OK: offset から新しい local_get が生成される
```

**ルール: `Struct.at()` や `Mem.byteGrid/i32Array2D` の base/cols 引数にランタイム式を渡す場合は、`WasmRef`（ローカル変数）を使うこと。**

`WasmRef` は `_idx` プロパティを持つだけの参照型で、`resolve()` のたびに新しい `local_get` IR ノードを生成する。何度使っても枯渇しない。

### コンパイル時 vs 実行時の区別

JS の `for` ループで `yield*` すると、ループはコンパイル時に展開される:

| JS 側（コンパイル時）     | Wasm 側（実行時）                                 |
| ------------------------- | ------------------------------------------------- |
| `for (const dir of dirs)` | 命令列がインラインに展開                          |
| `if (config.flag)`        | 条件に応じた命令のみ生成                          |
| `arr.map(x => ...)`       | 各要素に対応する命令列                            |
| `new Proxy(...)`          | Proxy のプロパティアクセスが命令列に展開          |
| `yield* Queue(base)`      | `head`/`tail` ローカル変数宣言 + API オブジェクト |
| `Ctrl.for(i, 0, ...)`     | `block + loop + br_if + br`                       |
| `Ctrl.while(cond, ...)`   | `block + loop + br_if + br`                       |

JS の制御構造やオブジェクト指向機能 → コンパイル時展開（zero overhead）。DSL の制御構造（`Ctrl.*`）→ 実行時の Wasm ループ。

---

## Meta namespace — ライブラリ提供のマクロヘルパ

上記の手動パターンを宣言的に記述する `Meta` namespace。全て zero-overhead（コンパイル時展開）。
`() => [...]` array body 内で使える点が手書き `for...of` との最大の違い。

### ステートメント展開

```typescript
import { Meta } from "@/dsl/compiler";

// Meta.each: 配列の各要素に対してステートメント展開
yield * Meta.each([0, 1, 2], (c) => [Mem.store8(offset.add(c), gray)]);

// Meta.times: N 回展開
yield * Meta.times(4, (i) => [Mem.store(i * 4, value)]);

// Meta.when: JS 条件が falsy なら命令を一切生成しない
yield * Meta.when(USE_ALPHA, () => [Mem.store8(offset.add(3), alpha)]);
```

### 式の畳み込み

```typescript
// Meta.sum: N 個の式を加算
Meta.sum([r.mul(77), g.mul(150), b.mul(29)]).shr(8);

// Meta.weightedSum: 重み付き加算（weight=0 スキップ、weight=1 乗算省略）
Meta.weightedSum([
  { weight: 77, expr: px.r },
  { weight: 150, expr: px.g },
  { weight: 29, expr: px.b },
]).shr(8);

// Meta.product: N 個の式を乗算
Meta.product([a, b, c]);
```

### 近傍定数

ドメイン固有の近傍オフセットはファイルローカルに定義する:

```typescript
// 4 近傍: Right, Left, Down, Up
const NEIGHBORS_4 = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];
for (const { dx, dy } of NEIGHBORS_4) { ... }

// 8 近傍: Game of Life 等
const NEIGHBORS_8 = [
  { dx: -1, dy: -1 }, { dx: -1, dy: 0 }, { dx: -1, dy: 1 },
  { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
  { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
];
for (const { dx, dy } of NEIGHBORS_8) { ... }
```

### 組み合わせ例: 3x3 畳み込みカーネル

```typescript
// Meta.each × Meta.weightedSum で 2D カーネル展開
const channels = ["r", "g", "b"] as const;
yield *
  Meta.each(channels, (c, ci) => [
    ch.set(
      Meta.weightedSum(
        kernel.map((weight, ki) => ({
          weight,
          expr: Mem.load8(neighborAddr(ki, ci)),
        })),
      )
        .div(divisor)
        .clamp(0, 255),
    ),
    dstPx[c].set(ch),
  ]);
```

### 組み合わせ例: Sepia 行列変換

```typescript
// Meta.each で出力チャンネル、Meta.weightedSum で行列行 × ベクトル
const rgb = [r, g, b]; // 先に読み出して WAR hazard 回避
yield *
  Meta.each([0, 1, 2], (outCh) => [
    ch.set(
      Meta.weightedSum(
        SEPIA_MATRIX[outCh]!.map((w, inCh) => ({
          weight: w,
          expr: rgb[inCh]!,
        })),
      )
        .shr(8)
        .clamp(0, 255),
    ),
    px[["r", "g", "b"][outCh] as "r" | "g" | "b"].set(ch),
  ]);
```

---

## OOP-style コンパイル時ヘルパ

JS のオブジェクト指向機能を活用して、メモリレイアウトやアドレス計算の複雑さを隠蔽するヘルパ群。これらは全て **コンパイル時の JS オブジェクト** であり、生成される Wasm には痕跡が残らない。

### メモリ抽象の 3 層構造

```
Layer 3 (ドメイン特化)   RGBA.at(offset).r       Queue(base).enqueue(v)
                         ↓                        ↓
Layer 2 (構造化)         Mem.byteGrid(0, w)       Mem.i32Array(base)
                         ↓                        ↓
Layer 1 (Raw)            Mem.load8(addr)           Mem.load(addr)
```

各レイヤは下のレイヤを組み合わせて構築される。ユーザは問題に適したレイヤを選択する:

- **Raw**: アドレス計算を完全に制御したい場合
- **構造化**: 2D グリッドや配列のストライド計算を隠蔽したい場合
- **ドメイン特化**: ピクセル操作や BFS キューなど、特定のパターンに最適化された API

### byteGrid — バイト単位の 2D グリッド

`Mem.byteGrid(base, cols)` は `row * cols + col` のアドレス計算を隠蔽する。Game of Life やモルフォロジー演算など byte-per-cell のグリッドに最適。

```typescript
const gridA = Mem.byteGrid(0, w);
const gridB = Mem.byteGrid(gridSize, w);

// 読み取り
yield * cell.set(gridA.load(y, x));

// 書き込み
yield * gridB.store(y, x, count.eq(3).or(cell.and(count.eq(2))));

// FieldAccessor（in-place mutation）
yield * gridA.at(y, x).incrBy(1);
```

### i32Array2D — 2D i32 配列

`Mem.i32Array2D(base, cols)` は `(row * cols + col) * 4 + base` のアドレス計算を隠蔽。DP テーブルに最適。`base` はランタイム式（`ExprInput`）も可。

```typescript
const cols = yield * local(Type.i32, len_b.add(1));
const dp = Mem.i32Array2D(DP_BASE, cols);

yield * dp.store(i, j, dp.load(i.sub(1), j.sub(1)).add(1));
yield * dp.at(i, j).incrBy(cost);
```

### RGBA — ピクセルアクセス Struct プリセット

`RGBA = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" })` は 4 つの packed u8 フィールドを持つ。`RGBA.at(offset)` で `px.r`, `px.g`, `px.b`, `px.a` の `FieldAccessor` にアクセスできる。

**重要:** `offset` には `WasmRef`（ローカル変数）を使うこと。[Single-use 制約](#single-use-制約-generator-は一度しか消費できない)を参照。

```typescript
const offset = yield * local(Type.i32);
// ...
yield * offset.set(i.mul(4));
const px = RGBA.at(offset);

yield *
  gray.set(
    Meta.weightedSum([
      { weight: 77, expr: px.r },
      { weight: 150, expr: px.g },
      { weight: 29, expr: px.b },
    ]).shr(8),
  );

for (const ch of ["r", "g", "b"] as const) {
  yield * px[ch].set(gray);
}
```

### Queue — Generator ファクトリパターン

`Queue(base)` は **Generator ファクトリ** — `yield*` でローカル変数（`head`/`tail`）を内部に確保し、操作メソッドを持つオブジェクトを返す。

```typescript
const q = yield * Queue(qBase);

yield * q.enqueue(startIdx);

yield *
  Ctrl.while(q.notEmpty, function* () {
    yield* q.dequeue(current);
    // ... BFS ロジック
    yield* q.enqueue(neighbor);
  });
```

**Generator ファクトリパターンのポイント:**

- `yield*` による初期化で、ローカル変数のスコープが内部に閉じ込められる
- 返されるオブジェクトのメソッドは、クロージャで内部変数にアクセスする
- 呼び出し側は `head`/`tail` の存在を意識せず、`enqueue`/`dequeue` だけを使う
- 生成される Wasm は手動で `head`/`tail` を管理した場合と完全に同一

このパターンは Queue 以外にも応用できる:

- Stack（push/pop/isEmpty）
- Ring buffer（固定長キュー）
- Accumulator（reduce パターンのカプセル化）

```typescript
// 自作 Generator ファクトリの例
function* Counter() {
  const count = yield* local(Type.i32, 0);
  return {
    increment(): FuncGen<void> {
      return count.incrBy(1);
    },
    get value(): ChainableExpr {
      return count;
    },
  };
}
```

---

## 設計指針

**使うべき場面:**

- 同一パターンが 3 回以上繰り返される
- 差分がパラメータ（数値、フィールド名、コールバック）で表現できる
- 展開後の命令列が元の手動展開と等価
- メモリレイアウトの計算が複雑で、バグの温床になりやすい

**使わないべき場面:**

- ループ回数が実行時に決まる場合 → `Ctrl.for` / `Ctrl.while` を使う
- 最適化意図を持つ手動展開（例: matmul のストライド管理）
- 2 回程度の繰り返しで、メタプロ化しても行数が減らない場合

**抽象化レベルの選択:**

| 状況                                       | 推奨                                    |
| ------------------------------------------ | --------------------------------------- |
| アドレス計算が 1 箇所だけ                  | Raw (`Mem.load/store`)                  |
| 同じストライド計算が繰り返される           | 構造化 (`byteGrid`, `i32Array2D`)       |
| 特定のドメインパターンが複数ファイルに出現 | プリセット/ファクトリ (`RGBA`, `Queue`) |
| 内部状態を持つ抽象化が必要                 | Generator ファクトリパターン            |
