# DSL 改善ロードマップ

15 問題のベンチマーク結果から得られた知見をもとに、DSL の品質向上・機能カバレッジ拡大の方針をまとめる。

---

## 1. 現状の定量評価

### Code Comparison（15 問題平均）

| 指標 | JS | DSL | 比率 |
|------|-----|-----|------|
| LoC（非空行） | 9.3 | 64.2 | **6.9x** |
| 最大ネスト深度 | 2.5 | 9.4 | **3.8x** |
| 制御フロー文 | 3.3 | 10.1 | **3.1x** |
| 変数宣言数 | 3.1 | 7.5 | **2.4x** |

- LoC 比率は 3.3x（fibonacci）〜 51.5x（flood-fill）と大きく幅がある
- flood-fill の 51.5x は 4 方向の分岐 + 境界チェックの分離（short-circuit 非対応）が主因
- 再帰的アルゴリズム（hanoi 18x）も ceremony が重い

### Spec Coverage

| 層 | カバー | 全体 | 比率 |
|----|--------|------|------|
| opcodes.ts | 71 | 172 | 41% |
| codegen | 37 | 172 | 22% |
| DSL | 37 | 172 | 22% |

codegen と DSL が完全に一致しているのは、既存の opcode が全て DSL 経由で使われていることを意味する。逆に言えば、opcodes.ts に登録済みだが codegen / DSL に繋がっていない 34 個は「配線するだけで使える」状態にある。

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

      return yield* Mem.i32(-1);
    });
    yield* Mod.export("binary_search", search);
  });
}
```

**39 → 26 行（33% 削減）、ネスト深度 9 → 6。** 構造の変更点:

1. `block + loop + br_if(1) + br(0)` → `Ctrl.while(cond, body)` — 4 行分のセレモニー消失
2. `Mem.load(mid.mul(4))` → `arr.load(mid)` — アドレス計算の隠蔽
3. `local(Type.i32); set(0)` → `local(Type.i32, 0)` — 宣言＋初期化の統合
4. void-only `.then()` に `.else()` + `Ctrl.nop()` 不要 — 自然な void 分岐

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

### 実装後 DSL（32 行）

```ts
export function problem7_sieve() {
  return compile<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);
    const sieve = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32, 0);

      yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
        yield* Mem.store8(i, 1);
      });

      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), function* () {
        yield* Ctrl.when(Mem.load8(i).eq(1), function* () {
          yield* Ctrl.for(j, i.mul(i), j.le(n), j.add(i), function* () {
            yield* Mem.store8(j, 0);
          });
        });
      });

      yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
        yield* Ctrl.when(Mem.load8(i).eq(1), function* () {
          yield* count.set(count.add(1));
        });
      });

      return yield* Loc.get(count);
    });
    yield* Mod.export("sieve", sieve);
  });
}
```

**61 → 32 行（48% 削減）。** JS の `for` ループとほぼ 1:1 対応になる。

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
| **P5** | `Mod.recursive(self => body)` | 4 箇所 | ~8 行 | 中 | DSL (interpreter) | 未着手 |

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

### Tier 1: 配線するだけ（opcodes.ts に存在、codegen/DSL 未接続）

| 命令 | 用途 | 優先度 |
|------|------|--------|
| `i32.eqz` | `x == 0` のショートカット。GCD, sieve 等 | 高 |
| | ✅ 実装済 — Ctrl.while/for の条件反転に使用 | |
| `i32.shr_u` | 符号なし右シフト。ビット操作全般 | 高 |
| `i32.div_u`, `i32.rem_u` | 符号なし除算・剰余 | 中 |
| `i32.lt_u`, `i32.gt_u`, `i32.le_u`, `i32.ge_u` | 符号なし比較。アドレス計算 | 中 |
| `select` | 三項演算子 `cond ? a : b`。`Ctrl.if` なしで値選択 | 高 |
| `memory.size`, `memory.grow` | 動的メモリ拡張 | 低 |

### Tier 2: 新規 opcode + IR + codegen 追加が必要

| 命令群 | 用途 | 優先度 |
|--------|------|--------|
| `i64.*` 演算 | 64bit 整数。暗号、ハッシュ | 中 |
| `f64.*` 演算 | 浮動小数点。科学計算 | 中 |
| `br_table` | switch/case。多分岐 | 低 |
| `call_indirect` | 関数ポインタ。仮想ディスパッチ | 低 |

### Tier 3: 新しい問題で動機づけ

coverage を上げるために問題を追加するのではなく、「この問題を解くにはこの命令が要る」という動機で拡張する。

| 問題案 | 必要な命令 |
|--------|-----------|
| SHA-256 / CRC32 | `i32.rotr`, `i32.xor`, `i32.shr_u` |
| Newton 法 (sqrt) | `f64.mul`, `f64.div`, `f64.sub` |
| 文字列マッチング | `i32.load8_s`, `i32.load16_u` |
| 動的配列 (vector) | `memory.size`, `memory.grow` |

---

## 7. まとめ

DSL 改善の方向性は「Wasm の構造を隠さず、セレモニーだけを隠す」。

- `Ctrl.for` は `block + loop + br_if + br` という **Wasm 固有の構造を隠す**（JS にも Wasm にも for ループの概念はある）
- `Mem.i32Array` は **バイトアドレス計算を隠す**（配列の概念は JS にも Wasm にもある）
- `instantiate()` は **WebAssembly API の型の弱さを隠す**（`as any` の封じ込め）

一方で、`yield*` による明示的な合成、`param` / `local` の型宣言、`Mem.load` / `Mem.store` による線形メモリの直接操作は **Wasm の本質的な特徴** であり、隠すべきではない。DSL が目指すのは「Wasm を書いている」実感を保ちつつ、定型パターンの記述コストを下げることにある。
