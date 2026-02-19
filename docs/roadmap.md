# DSL 改善ロードマップ

15 問題のベンチマーク結果から得られた知見をもとに、DSL の品質向上・機能カバレッジ拡大の方針をまとめる。

---

## 1. 現状の定量評価

### Code Comparison（15 問題平均・P5-P10 実装後）

| 指標 | JS | DSL | 比率 |
|------|-----|-----|------|
| LoC（非空行） | 9.3 | 43.6 | **4.7x** |
| 最大ネスト深度 | 2.5 | 6.6 | **2.6x** |

- LoC 比率は 2.3x（fibonacci）〜 37.5x（flood-fill）と幅がある
- P0-P10 の sugar 実装により LoC 比率は 6.9x → 4.7x に改善
- flood-fill は Ctrl.switch で 22 行の分岐カスケードを解消（51.5x → 37.5x）

### Spec Coverage

| 層 | カバー | 全体 | 比率 |
|----|--------|------|------|
| opcodes.ts | 172 | 172 | 100% |
| codegen | 172 | 172 | 100% |
| DSL | 172 | 172 | 100% |

P14 で 30 命令を配線し 40% に到達後、`br_table`, `global_get/set` 等を追加して 99%、さらに `call_indirect`（Table/Element セクション含む）を実装して **100% Wasm MVP opcode カバレッジを達成**。

---

## 2. ボイラープレート分類

15 問題のコードを分析し、繰り返し現れるパターンを 6 つ特定した。

### B1: ループの儀式 — `block + loop + br_if + br`

**頻度:** 13/15 ファイル、約 30 箇所

Wasm にはネイティブな `for` / `while` がなく、`block { loop { br_if(1, !cond); ...; br(0); } }` で構造化ループを表現する。DSL でもこの 5 行構造がそのまま露出している。

```ts
// 現状 — 7 行のセレモニー
yield* i.set(2);
yield* Ctrl.block(function* () {
  yield* Ctrl.loop(function* () {
    yield* Ctrl.br_if(1, i.gt(n));
    yield* Mem.store8(i, 1);
    yield* i.set(i.add(1));
    yield* Ctrl.br(0);
  });
});
```

```js
// JS 相当 — 3 行
for (let i = 2; i <= n; i++) {
  flags[i] = 1;
}
```

**理想形:**

```ts
// 案: Ctrl.for(variable, start, continueWhile, step, body)
yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
  yield* Mem.store8(i, 1);
});

// 案: Ctrl.while(continueWhile, body)
yield* Ctrl.while(lo.le(hi), function* () {
  yield* mid.set(lo.add(hi).div(2));
  // ...
});
```

`Ctrl.for` / `Ctrl.while` は内部的に `block + loop + br_if(1) + br(0)` へ展開する純粋な構文糖衣。Wasm 出力は一切変わらない。約 30 箇所 × 4 行 = **120 行以上**の削減が見込める。

### B2: メモリストライド — `.mul(4)` の反復

**頻度:** 14/15 ファイル、約 80 箇所

i32 配列を線形メモリで扱う場合、要素インデックスからバイトアドレスへの変換 `i.mul(4)` が毎回必要になる。2D 配列ではさらに `i.mul(cols).add(j).mul(4).add(BASE)` のような長い式になる。

```ts
// 現状 — LCS の DP テーブルアクセス
Mem.load(i.sub(1).mul(cols).add(j.sub(1)).mul(4).add(DP_BASE))
```

```js
// JS 相当
dp[(i - 1) * (n + 1) + (j - 1)]
```

**理想形:**

```ts
// 案: Mem.i32Array(base) → 型付き配列ヘルパ
const dp = Mem.i32Array(DP_BASE);
dp.load(i.sub(1).mul(cols).add(j.sub(1)))   // .mul(4).add(BASE) を内部で付与
dp.store(idx, val)

// 2D の場合は関数で抽象化
const dp2d = (r: ExprInput, c: ExprInput) =>
  dp.load(r.mul(cols).add(c));  // ストライドは dp が処理
```

`.mul(4)` を排除するだけでコードの意図が明確になり、off-by-one 的なバイトアドレスミスも防げる。

### B3: void 条件分岐の `function*` ラッパ

**頻度:** 14/15 ファイル、約 30 箇所

void（副作用のみ）の `Ctrl.if` でも `function* () { ... }` 構文が必須。1 行の副作用に 3 行のラッパが必要。

```ts
// 現状 — 1 行の副作用に 3 行のラッパ
yield* Ctrl.if(Mem.load8(i).eq(1))
  .then(function* () {
    yield* count.set(count.add(1));
  });
```

```js
// JS 相当
if (flags[i]) count++;
```

**理想形:**

```ts
// 案: Ctrl.when(cond, body) — void-only ショートカット
yield* Ctrl.when(Mem.load8(i).eq(1), function* () {
  yield* count.set(count.add(1));
});
```

`Ctrl.when` は `.then()` のみ・戻り値なしの一般的ケースの省略形。`.else` が不要なケースが大半（約 20/30 箇所）なので効果が大きい。

### B4: local 初期値の 2 ステップ宣言

**頻度:** 13/15 ファイル、約 30 箇所

`yield* local(Type.i32)` の直後に `yield* i.set(0)` が続く宣言＋初期化パターン。

```ts
// 現状 — 2 行
const i = yield* local(Type.i32);
yield* i.set(0);
```

**理想形:**

```ts
// 案: local() にオプショナルな初期値
const i = yield* local(Type.i32, 0);
const hi = yield* local(Type.i32, len.sub(1));
```

Wasm のローカル変数はデフォルト 0 なので、0 初期化は省略可能。非 0 初期化時は interpreter が `local_set` を自動挿入する。

### B5: 再帰関数の前方宣言

**頻度:** 4/15 ファイル（hanoi, quicksort, nqueens, union-find）

```ts
// 現状 — let + 再代入
let solve: CallableFunc;
solve = yield* Mod.func(function* () {
  // ... solve(...) を再帰呼び出し
});
```

**理想形:**

```ts
// 案: Mod.recursive — self 引数で自己参照
const solve = yield* Mod.recursive(function* (self) {
  // ... self(...) で再帰呼び出し
});
```

型推論も `let` + `CallableFunc` アノテーションが不要になる。

### B6: テスト / ベンチのインスタンス化ボイラープレート（WasmBinary\<T\> で更に改善）

**頻度:** 全 15 テストファイル + 10 ベンチファイル + runner.ts

```ts
// 現状 — 4-5 行 + eslint-disable
const wasm = problem5_binary_search();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { instance } = (await WebAssembly.instantiate(wasm)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
const search = instance.exports.binary_search as (len: number, target: number) => number;
```

**理想形:**

```ts
// 案: instantiate() ヘルパ
import { instantiate } from "../test-helpers";

const { exports, mem } = await instantiate(problem5_binary_search());
const search = exports.binary_search as (len: number, target: number) => number;
```

ヘルパの設計案:

```ts
export async function instantiate<T extends Record<string, unknown> = Record<string, unknown>>(
  binary: Uint8Array,
  imports?: WebAssembly.Imports,
): Promise<{
  exports: T & { memory?: WebAssembly.Memory };
  mem: Int32Array | null;
  bytes: Uint8Array | null;
}> {
  const result: any = await WebAssembly.instantiate(binary, imports);
  const exp = result.instance.exports;
  const memory = exp.memory as WebAssembly.Memory | undefined;
  return {
    exports: exp as T & { memory?: WebAssembly.Memory },
    mem: memory ? new Int32Array(memory.buffer) : null,
    bytes: memory ? new Uint8Array(memory.buffer) : null,
  };
}
```

`as any` と `eslint-disable` を 1 箇所に閉じ込め、25+ ファイルから消去できる。`bytes` は `Mem.load8/store8` を使う問題（sieve）のテストで有用。

---

## 3. 理想形の比較：Binary Search

### JS（11 行）

```js
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) / 2 | 0;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
```

### 現状 DSL（39 行）

```ts
export function problem5_binary_search(): Uint8Array {
  return compile(function* () {
    const search = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32);
      const hi = yield* local(Type.i32);
      const mid = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* Loc.set(lo, 0);
      yield* hi.set(len.sub(1));

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, lo.gt(hi));
          yield* mid.set(lo.add(hi).div(2));
          yield* v.set(Mem.load(mid.mul(4)));
          yield* Ctrl.if(v.eq(target))
            .then(function* () {
              yield* Loc.return(mid);
            })
            .else(function* () {
              yield* Ctrl.if(v.lt(target))
                .then(function* () { yield* lo.set(mid.add(1)); })
                .else(function* () { yield* hi.set(mid.sub(1)); });
              yield* Ctrl.nop();
            });
          yield* Ctrl.br(0);
        });
      });

      return yield* Mem.i32(-1);
    });
    yield* Mod.export("binary_search", search);
  });
}
```

### 実装後 DSL（26 行）

```ts
export function problem5_binary_search() {
  return compile<{ binary_search: (len: number, target: number) => number }>(function* () {
    const arr = Mem.i32Array();
    const search = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32, 0);
      const hi = yield* local(Type.i32, len.sub(1));
      const mid = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* Ctrl.while(lo.le(hi), function* () {
        yield* mid.set(lo.add(hi).div(2));
        yield* v.set(arr.load(mid));
        yield* Ctrl.if(v.eq(target)).then(function* () {
          yield* Loc.return(mid);
        });
        yield* Ctrl.if(v.lt(target))
          .then(function* () { yield* lo.set(mid.add(1)); })
          .else(function* () { yield* hi.set(mid.sub(1)); });
      });

      return -1;
    },
  );

  // Batch search
  const search_batch = yield* Mod.func(
    { len: Type.i32, tbase: Type.i32, tcount: Type.i32 },
    function* (len, tbase, tcount) {
      const ti = yield* local(Type.i32);
      const sum = yield* local(Type.i32, 0);

      yield* Ctrl.for(ti, 0, ti.lt(tcount), ti.add(1), () => [
        sum.incrBy(binary_search(len, Mem.load(tbase.add(ti.mul(4))))),
      ]);

      return sum;
    },
  );

  yield* Mod.exportAll({ binary_search, search_batch });
});
}
```

**39 → 26 行（33% 削減）、ネスト深度 9 → 6。** 構造の変更点:

1. `block + loop + br_if(1) + br(0)` → `Ctrl.while(cond, body)` — 4 行分のセレモニー消失
2. `Mem.load(mid.mul(4))` → `arr.load(mid)` — アドレス計算の隠蔽
3. `local(Type.i32); set(0)` → `local(Type.i32, 0)` — 宣言＋初期化の統合
4. `return yield* Mem.i32(-1)` → `return -1` — 暗黙の return coercion
5. `sum.incrBy(...)` — 複合代入メソッドで `sum.set(sum.add(...))` を簡潔に

---

## 4. 理想形の比較：Sieve of Eratosthenes

### JS（11 行）

```js
function sieve(n) {
  const flags = new Uint8Array(n + 1);
  flags.fill(1);
  for (let i = 2; i * i <= n; i++)
    if (flags[i]) for (let j = i * i; j <= n; j += i) flags[j] = 0;
  let count = 0;
  for (let i = 2; i <= n; i++) if (flags[i]) count++;
  return count;
}
```

### 現状 DSL（61 行）

4 つの `block + loop + br_if + br` と `Mem.store8/load8` が展開されて 61 行。

### 実装後 DSL（38 行）

```ts
export function problem7_sieve() {
  return compile<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("sieve", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32, 0);

      // Bulk init: write 0x01010101 in i32 chunks (4x fewer iterations)
      yield* Ctrl.for(i, 0, i.le(n.div(4)), i.add(1), () => [
        Mem.store(i.mul(4), 0x01010101),
      ]);
      yield* Mem.store8(0, 0);
      yield* Mem.store8(1, 0);

      // Sieve: for p from 2 while p*p <= n
      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          Ctrl.for(j, i.mul(i), j.le(n), j.add(i), () => [
            Mem.store8(j, 0),
          ]),
        ]),
      ]);

      // Count primes
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          count.incrBy(1),
        ]),
      ]);

      return count;
    });
  });
}
```

**61 → 38 行（38% 削減）。** `Mod.exportFunc` で関数宣言と export を統合、`count.incrBy(1)` で複合代入、`return count` で暗黙の local_get。

---

## 5. 実装優先度

改善提案をインパクト（LoC 削減 × 出現頻度）と実装コストで評価する。

| 優先 | 提案 | 影響範囲 | LoC 削減見込 | 実装コスト | 層 | 状態 |
|------|------|---------|-------------|-----------|-----|------|
| **P0** | `instantiate()` ヘルパ | 25+ ファイル | ~100 行 | 低 | テスト/ベンチ | ✅ 実装済 |
| **P1** | `Ctrl.for` / `Ctrl.while` | 30 箇所 | ~120 行 | 中 | DSL (namespaces) | ✅ 実装済 |
| **P2** | `Mem.i32Array(base)` | 80 箇所 | ~80 行 | 中 | DSL (namespaces) | ✅ 実装済 |
| **P3** | `local(type, init)` | 30 箇所 | ~30 行 | 低 | DSL (declarations + interpreter) | ✅ 実装済 |
| **P4** | `Ctrl.when(cond, body)` | 20 箇所 | ~40 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P5** | `Op.select` / `Op.max` / `Op.min` | ~8 箇所 | ~30 行 | 低 | IR + codegen + DSL | ✅ 実装済 |
| **P6** | `Mem.i32Array2D(base, cols)` | ~17 箇所 | ~20 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P7** | `Ctrl.switch(expr).case().default()` | 2 箇所 | ~14 行 | 中 | DSL (namespaces) | ✅ 実装済 |
| **P8** | `i32Array.swap(i, j, tmp)` | 2 箇所 | ~4 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P9** | `Mod.exportAll({...})` | 1 箇所 | ~3 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P10** | `Mod.recursive(self => body)` | 4 箇所 | ~8 行 | 中 | DSL (interpreter) | ✅ 実装済 |
| **P11** | 配列記法 `() => [a(), b()]` | 全 `VoidBody` | ~15 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P12** | `Mod.func({ a: Type.i32 }, (a) => ...)` inline params | 全 func 宣言 | ~10 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P13** | `Mod.exportFunc(name, body)` | export+func | ~3 行 | 低 | DSL (namespaces) | ✅ 実装済 |
| **P14** | Spec Coverage 拡大 (i64/f64/unsigned/conversions) | 30 opcodes | — | 中 | IR + codegen + DSL | ✅ 実装済 |

### P0: `instantiate()` ヘルパ

DSL 本体ではないが、compile → instantiate のボイラープレートはテスト・ベンチ・runner の全ファイルに存在する。`as any` + `eslint-disable` を 1 箇所に閉じ込める効果も大きい。

- **ファイル:** `src/test-helpers.ts`（新規）
- **依存:** なし

### P1: `Ctrl.for` / `Ctrl.while`

最大インパクト。LoC 比率を平均 6.9x → 4-5x 程度まで改善可能。

- **ファイル:** `src/dsl/namespaces.ts` に追加
- **依存:** なし（`block + loop + br_if + br` の展開は既存の interpreter がそのまま処理）

### P2: `Mem.i32Array(base)`

アドレス計算の隠蔽。off-by-one ミスの防止にも有効。

- **ファイル:** `src/dsl/namespaces.ts` に追加
- **依存:** なし（内部で既存の `Mem.load` / `Mem.store` を呼ぶだけ）

### P5: `Op.select` / `Op.max` / `Op.min`

Wasm の `select` 命令（branchless 三項選択）を IR → codegen → DSL の全層に追加。`Op.max(a, b)` / `Op.min(a, b)` は select ベースの sugar。

- **ファイル:** `src/wasm/ir.ts`（IRNode 追加）, `src/wasm/codegen.ts`（emit 追加）, `src/dsl/expr.ts`（`select_` 関数）, `src/dsl/namespaces.ts`（Op に追加）
- **注意:** Generator は一度しか consume できないため、`max(a, b)` は内部で `resolve()` してから IR ノードを再利用する設計

### P6: `Mem.i32Array2D(base, cols)`

2D 配列のアドレス計算 `(row * cols + col) * 4 + base` を隠蔽。`cols` は `ExprInput` なので実行時の値も可。

- **ファイル:** `src/dsl/namespaces.ts` に追加
- **適用:** lcs（dpArr → dp 2D）, matmul（A 行列）

### P7: `Ctrl.switch(expr).case(v, body).default(body)`

多方向分岐をビルダパターンで宣言的に記述。`SwitchBuilder` → `SwitchCaseBuilder` → `SwitchDefaultBuilder` の 3 クラス構成で、最低 1 つの `.case()` を型レベルで強制。Dense contiguous cases は `br_table` に最適化、sparse は if/else チェインにフォールバック。

- **ファイル:** `src/dsl/namespaces.ts` に追加
- **適用:** flood-fill（4方向分岐 22行 → 6行）

### P8: `i32Array.swap(i, j, tmp)`

配列の要素交換を1行で。内部は `tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp`。

- **ファイル:** `src/dsl/namespaces.ts`（i32Array の返却オブジェクトに追加）
- **適用:** quicksort（swap 2箇所）

### P9: `Mod.exportAll({...})`

複数 export を `Object.entries` でループして一括定義。

- **ファイル:** `src/dsl/namespaces.ts` に追加
- **適用:** union-find（4 export → 1行）

## 5.1 追加実装: WasmBinary\<T\> phantom type

P0-P4 の実装に加え、型安全性の改善として `WasmBinary<T>` ファントム型を導入した。

### 型の流れ

```
compile<{ fib: (n: number) => number }>(...)
  → WasmBinary<{ fib: ... }>
    → instantiate(binary)  // T を自動推論
      → { exports: { fib }, mem }  // 型安全
```

- `compile<T>()` の型パラメータで export 関数のシグネチャを宣言
- `WasmBinary<T>` = `Uint8Array & { readonly __exports?: T }` — 実行時は純粋な Uint8Array
- `instantiate<T>()` が `WasmBinary<T>` から T を推論し、`exports: T` を返す
- テスト・ベンチ・runner から全ての `as` キャストを排除（`as any` は test-helpers.ts の 1 箇所のみ）

---

## 6. Spec Coverage 拡大方針

現在 codegen/DSL が 22% (37/172)。opcodes.ts には登録済みだが codegen 未接続の 34 命令のうち、問題実装で有用なものを優先的に繋ぐ。

### Tier 1: 配線するだけ — ✅ 全て完了

| 命令 | 用途 | 状態 |
|------|------|------|
| `i32.eqz` | ✅ Ctrl.while/for の条件反転に使用 | 実装済 |
| `i32.shr_u`, `i32.div_u`, `i32.rem_u` | ✅ `Op.shr_u/div_u/rem_u` | 実装済 |
| `i32.lt_u`, `i32.gt_u`, `i32.le_u`, `i32.ge_u` | ✅ `Op.lt_u/gt_u/le_u/ge_u` | 実装済 |
| `select` | ✅ `Op.select`, `Op.max`, `Op.min` | 実装済 |
| `memory.size`, `memory.grow` | ✅ `Mem.size()`, `Mem.grow(pages)` | 実装済 |
| `unreachable` | ✅ `Ctrl.unreachable()` | 実装済 |
| `i64.load/store`, `f64.load/store` | ✅ `Mem.loadI64/storeI64/loadF64/storeF64` | 実装済 |
| `f64.const` | ✅ `Mem.f64(v)` | 実装済 |
| `i64.add/sub/mul/div_s` | ✅ `Op.i64.add/sub/mul/div` | 実装済 |
| `i64.eqz` | ✅ `Op.i64.eqz` | 実装済 |
| `f64.add/sub/mul/div` | ✅ `Op.f64.add/sub/mul/div` | 実装済 |
| `f64.neg`, `f64.abs` | ✅ `Op.f64.neg`, `Op.f64.abs` | 実装済 |
| `i32.wrap_i64`, `i64.extend_i32_s` | ✅ `Op.wrap`, `Op.extend` | 実装済 |
| `f64.convert_i32_s`, `i32.trunc_f64_s` | ✅ `Op.toF64`, `Op.truncI32` | 実装済 |

### Tier 2: 実装済み — ✅ 完了

| 命令群 | 用途 | 状態 |
|--------|------|------|
| `call_indirect` | 関数ポインタ。仮想ディスパッチ、`Mod.table()` + stdlib sort で活用 | ✅ 実装済 |

### Tier 3: 新しい問題で動機づけ

coverage を上げるために問題を追加するのではなく、「この問題を解くにはこの命令が要る」という動機で拡張する。

| 問題案 | 必要な命令 | 状態 |
|--------|-----------|------|
| SHA-256 / CRC32 | `i32.rotr`, `i32.xor`, `i32.shr_u` | ✅ CRC32 実装済（`examples/realworld/crc32.ts`） |
| Newton 法 (sqrt) | `f64.mul`, `f64.div`, `f64.sub` | |
| 文字列マッチング | `i32.load8_s`, `i32.load16_u` | |
| 動的配列 (vector) | `memory.size`, `memory.grow` | |

※ これらの命令は opcodes.ts に登録済みで codegen にも接続済み（100% カバレッジ）。

### Realworld Examples（実装済）

| Example | 活用する DSL 機能 |
|---------|------------------|
| **Grayscale** | `Mem.load8/store8`, `Op.max/min`（ブランチレスクランプ）, 複数関数 export |
| **CRC32** | `Mod.data()`（ルックアップテーブル埋め込み）, `Op.shr_u`, XOR チェイン |
| **Game of Life** | ネスト `Ctrl.for`, ダブルバッファリング, `.eq()` / `.and()` / `.or()` でブランチレス判定 |
| **Particles** | `Struct` + `BumpAllocator`, f64 全フィールド, `Op.f64.neg`, `Ctrl.when` で壁反射 |

---

## 7. まとめ

DSL 改善の方向性は「Wasm の構造を隠さず、セレモニーだけを隠す」。

- `Ctrl.for` は `block + loop + br_if + br` という **Wasm 固有の構造を隠す**（JS にも Wasm にも for ループの概念はある）
- `Mem.i32Array` は **バイトアドレス計算を隠す**（配列の概念は JS にも Wasm にもある）
- `instantiate()` は **WebAssembly API の型の弱さを隠す**（`as any` の封じ込め）

一方で、`yield*` による明示的な合成、`param` / `local` の型宣言、`Mem.load` / `Mem.store` による線形メモリの直接操作は **Wasm の本質的な特徴** であり、隠すべきではない。DSL が目指すのは「Wasm を書いている」実感を保ちつつ、定型パターンの記述コストを下げることにある。
