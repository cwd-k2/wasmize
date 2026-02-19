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
yield* Ctrl.for(dy, -1, dy.le(1), dy.add(1), function* () {
  yield* Ctrl.for(dx, -1, dx.le(1), dx.add(1), function* () {
    yield* Ctrl.when(dx.ne(0).or(dy.ne(0)), function* () { /* ... */ });
  });
});

// After: JS 側で 8 オフセットを列挙
const neighbors = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
for (const [ddx, ddy] of neighbors) {
  yield* ny.set(y.add(ddy));
  yield* nx.set(x.add(ddx));
  yield* Ctrl.when(
    ny.ge(0).and(ny.lt(h)).and(nx.ge(0)).and(nx.lt(w)),
    () => [count.incrBy(Mem.load8(ny.mul(w).add(nx)))],
  );
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
  yield* coord.set(p[pos]);
  yield* Ctrl.when(coord.lt(f64(0)), function* () {
    yield* p[pos].set(coord.neg());
    yield* p[vel].set(p[vel].neg());
  });
  yield* coord.set(p[pos]); // reload
  yield* Ctrl.when(coord.gt(bound), function* () {
    yield* p[pos].set(bound.mul(f64(2)).sub(coord));
    yield* p[vel].set(p[vel].neg());
  });
}
```

x 軸の 4 壁チェック + y 軸の 4 壁チェック（29行）→ 1 ループ（19行）。

### 4. 単純チャンネルループ — 繰り返し store/load の圧縮

**例: grayscale の RGB 書き込み**

```typescript
// Before
yield* Mem.store8(offset, gray);
yield* Mem.store8(offset.add(1), gray);
yield* Mem.store8(offset.add(2), gray);

// After
for (const c of [0, 1, 2]) {
  yield* Mem.store8(offset.add(c), gray);
}
```

---

## 注意事項

### FieldAccessor は single-use

`Struct.at(i)` が返す Proxy は、プロパティアクセスのたびに新しい `FieldAccessor` を生成する。`FieldAccessor` は内部に Generator（`_inner`）を持ち、**Generator は JS では一度しかイテレートできない**。

```typescript
// NG: FieldAccessor をキャッシュして複数回使用
const axes = [{ pos: p.x, vel: p.vx }]; // p.x を 1 度だけ取得
for (const { pos, vel } of axes) {
  yield* coord.set(pos);    // (1) pos._inner を消費
  yield* coord.set(pos);    // (2) 枯渇した Generator → undefined → TypeError!
}

// OK: 文字列キーで毎回フレッシュにアクセス
const axes = [{ pos: "x", vel: "vx" }] as const;
for (const { pos, vel } of axes) {
  yield* coord.set(p[pos]);   // p["x"] → Proxy get → 新しい FieldAccessor
  yield* coord.set(p[pos]);   // p["x"] → Proxy get → また新しい FieldAccessor
}
```

FieldAccessor に限らず、`ChainableExpr` が内部に持つ Generator は全て single-use。同じ式を複数箇所で使う場合は、毎回新しく生成する設計にする。

### コンパイル時 vs 実行時の区別

JS の `for` ループで `yield*` すると、ループはコンパイル時に展開される:

| JS 側（コンパイル時） | Wasm 側（実行時） |
|---|---|
| `for (const dir of dirs)` | 命令列がインラインに展開 |
| `if (config.flag)` | 条件に応じた命令のみ生成 |
| `arr.map(x => ...)` | 各要素に対応する命令列 |
| `Ctrl.for(i, 0, ...)` | `block + loop + br_if + br` |
| `Ctrl.while(cond, ...)` | `block + loop + br_if + br` |

JS の制御構造 → コンパイル時展開（zero overhead）、DSL の制御構造（`Ctrl.*`）→ 実行時の Wasm ループ。

---

## Meta namespace — ライブラリ提供のマクロヘルパ

上記の手動パターンを宣言的に記述する `Meta` namespace。全て zero-overhead（コンパイル時展開）。
`() => [...]` array body 内で使える点が手書き `for...of` との最大の違い。

### ステートメント展開

```typescript
import { Meta } from "@/dsl/compiler";

// Meta.each: 配列の各要素に対してステートメント展開
yield* Meta.each([0, 1, 2], (c) => [
  Mem.store8(offset.add(c), gray),
]);

// Meta.times: N 回展開
yield* Meta.times(4, (i) => [
  Mem.store(i * 4, value),
]);

// Meta.when: JS 条件が falsy なら命令を一切生成しない
yield* Meta.when(USE_ALPHA, () => [
  Mem.store8(offset.add(3), alpha),
]);
```

### 式の畳み込み

```typescript
// Meta.sum: N 個の式を加算
Meta.sum([r.mul(77), g.mul(150), b.mul(29)]).shr(8)

// Meta.weightedSum: 重み付き加算（weight=0 スキップ、weight=1 乗算省略）
Meta.weightedSum([
  { weight: 77, expr: Mem.load8(offset) },
  { weight: 150, expr: Mem.load8(offset.add(1)) },
  { weight: 29, expr: Mem.load8(offset.add(2)) },
]).shr(8)

// Meta.product: N 個の式を乗算
Meta.product([a, b, c])
```

### 近傍定数

```typescript
// 4 近傍: Right, Left, Down, Up
for (const { dx, dy } of Meta.neighbors4) { ... }

// 8 近傍: Game of Life 等
for (const { dx, dy } of Meta.neighbors8) { ... }
```

### 組み合わせ例: 3x3 畳み込みカーネル

```typescript
// Meta.each × Meta.weightedSum で 2D カーネル展開
yield* Meta.each([0, 1, 2], (c) => [
  ch.set(
    Meta.weightedSum(
      kernel.map((weight, ki) => ({
        weight,
        expr: Mem.load8(neighborAddr(ki, c)),
      })),
    ).div(divisor).clamp(0, 255),
  ),
  Mem.store8(dstAddr.add(c), ch),
]);
```

### 組み合わせ例: Sepia 行列変換

```typescript
// Meta.each で出力チャンネル、Meta.weightedSum で行列行 × ベクトル
const rgb = [r, g, b]; // 先に読み出して WAR hazard 回避
yield* Meta.each([0, 1, 2], (outCh) => [
  ch.set(
    Meta.weightedSum(
      SEPIA_MATRIX[outCh]!.map((w, inCh) => ({
        weight: w,
        expr: rgb[inCh]!,
      })),
    ).shr(8).clamp(0, 255),
  ),
  Mem.store8(offset.add(outCh), ch),
]);
```

---

## 設計指針

**使うべき場面:**
- 同一パターンが 3 回以上繰り返される
- 差分がパラメータ（数値、フィールド名、コールバック）で表現できる
- 展開後の命令列が元の手動展開と等価

**使わないべき場面:**
- ループ回数が実行時に決まる場合 → `Ctrl.for` / `Ctrl.while` を使う
- 最適化意図を持つ手動展開（例: matmul のストライド管理）
- 2 回程度の繰り返しで、メタプロ化しても行数が減らない場合
