# wasmize Gap Specification

Wasm 仕様・DSL・stdlib・ランタイムの全ギャップを網羅した実装仕様書。各項目は独立して実装可能な単位に分割されている。

## 凡例

- **ID**: `W-nn`（Wasm spec）, `D-nn`（DSL）, `S-nn`（stdlib）, `R-nn`（runtime）, `T-nn`（tooling/debug）, `V-nn`（static validation）
- **Tier**: 1（高優先）, 2（中優先）, 3（低優先）
- **Deps**: 先に実装が必要な項目の ID
- **Files**: 変更が必要なファイル（`packages/core/src/` からの相対パス）

---

## W: Wasm Spec Coverage

### W-01: Start Section（Section 8）
**Tier 1** | Deps: なし

モジュールインスタンス化時に自動実行される start function を指定するセクション。初期化ルーチンのエクスポート不要化。

**仕様:**
- `Mod.start(funcRef)` — 指定した関数を start function に設定
- Module builder が Section 8 を Export（Section 7）の後、Element（Section 9）の前に emit
- Section 8 フォーマット: `section(8, () => { enc.u32(funcIndex) })`
- start function は引数なし・戻り値なしでなければならない（コンパイル時検証）

**Files:** `wasm/module.ts`（Section 8 emit 追加）, `dsl/namespaces.ts`（`Mod.start` 追加）, `dsl/interpreter.ts`（start 命令処理）

**テスト:** start function がインスタンス化時にメモリを初期化するケース。`instantiate()` 後にメモリを読んで検証。

---

### W-02: Sign-Extension Operations
**Tier 1** | Deps: なし

i32/i64 のサブワード符号拡張命令。opcodes.ts に定数は定義済みだが codegen 未接続。

**仕様:**
- 5 命令: `i32.extend8_s`(0xC0), `i32.extend16_s`(0xC1), `i64.extend8_s`(0xC2), `i64.extend16_s`(0xC3), `i64.extend32_s`(0xC4)
- IR: `convert` ノードに 5 つの `ConvertKind` を追加（`i32_extend8_s`, `i32_extend16_s`, `i64_extend8_s`, `i64_extend16_s`, `i64_extend32_s`）
- codegen: `convertTable` にエントリ追加
- DSL: `Op.convert.i32_extend8_s(expr)` 等。`WasmRef`/`ChainableExpr` に `.extend8s()` メソッド追加
- capabilities: `scanFeatures` で sign-extension 命令検出を有効化

**Files:** `wasm/ir.ts`（ConvertKind 拡張）, `wasm/codegen.ts`（convertTable 追加）, `wasm/opcodes.ts`（確認のみ、定義済み）, `dsl/namespaces.ts`（Op.convert 拡張）, `dsl/expr.ts`（メソッド追加）, `wasm/capabilities.ts`（検出ロジック更新）

**テスト:** `i32.extend8_s(0xFF)` → `-1`, `i32.extend16_s(0xFFFF)` → `-1`, `i64.extend32_s(0xFFFFFFFF)` → `-1` 等

---

### W-03: Bulk Memory Operations
**Tier 1** | Deps: なし

`memory.copy`, `memory.fill` でバイト単位ループを置き換え、大幅な性能向上。

**仕様:**
- 4 命令:
  - `memory.copy`(0xFC 0x0A): `(dst, src, len)` — メモリ間コピー
  - `memory.fill`(0xFC 0x0B): `(dst, val, len)` — メモリ一括初期化
  - `data.drop`(0xFC 0x09): passive data segment の破棄（W-04 と関連）
  - `memory.init`(0xFC 0x08): passive data segment からメモリへコピー（W-04 と関連）
- IR ノード追加:
  - `{ op: "memory_copy", dst: IRNode, src: IRNode, len: IRNode }`
  - `{ op: "memory_fill", dst: IRNode, val: IRNode, len: IRNode }`
- codegen: 0xFC プレフィックス + 2バイト目 opcode + memory index (0x00 0x00 for copy, 0x00 for fill)
- DSL: `Mem.copy(dst, src, len)`, `Mem.fill(dst, val, len)` — `StmtInstruction` を yield
- stdlib/mem.ts: `memcpy`/`memset` を bulk memory 版に差し替えるオプション
- capabilities: `scanFeatures` で `memory_copy`/`memory_fill` → `"bulk-memory"` 検出

**Files:** `wasm/ir.ts`, `wasm/codegen.ts`, `wasm/opcodes.ts`（0xFC プレフィックス追加）, `dsl/namespaces.ts`（Mem 拡張）, `wasm/capabilities.ts`, `wasm/module.ts`（data count section 追加が必要な場合あり）

**テスト:** 1KB のメモリ領域を copy/fill し、バイト比較で検証。stdlib `memcpy`/`memset` との結果一致テスト。

---

### W-04: Passive Data Segments
**Tier 2** | Deps: W-03

Active segment（インスタンス化時に自動コピー）に加え、passive segment（明示的に `memory.init` で遅延ロード）をサポート。

**仕様:**
- Data segment に `mode: "active" | "passive"` フィールド追加
- Passive segment: Section 11 で flag = 0x01（active は 0x00）
- `Mod.dataPassive(bytes)` — passive data segment を宣言、segment index を返す
- `Mem.init(segIdx, dst, src, len)` — passive segment からメモリにコピー
- `Mem.dataDrop(segIdx)` — segment を破棄（メモリ節約）
- Data Count Section（Section 12）の追加が必要（bulk-memory 仕様要求）

**Files:** `wasm/module.ts`（passive flag + Section 12）, `wasm/ir.ts`（memory_init, data_drop ノード）, `wasm/codegen.ts`, `dsl/namespaces.ts`

**テスト:** passive segment を memory.init で遅延ロードし、内容検証。data.drop 後に再 init が trap することを確認。

---

### W-05: Saturating Truncation
**Tier 2** | Deps: なし

`f64→i32` 変換で NaN/無限大/範囲外の場合に trap せずクランプする命令。

**仕様:**
- 8 命令（0xFC プレフィックス）:
  - `i32.trunc_sat_f32_s/u`, `i32.trunc_sat_f64_s/u`
  - `i64.trunc_sat_f32_s/u`, `i64.trunc_sat_f64_s/u`
- IR: `convert` ノードに 8 つの `ConvertKind` 追加（`i32_trunc_sat_f32_s` 等）
- codegen: 0xFC プレフィックス + index バイト
- DSL: `Op.convert.i32_trunc_sat_f64_s(expr)` 等。`ChainableExpr<"f64">` に `.toI32Sat()` メソッド
- capabilities: `"nontrapping-float-to-int"` feature を `WasmFeature` に追加（または `"bulk-memory"` に含める — 実際は別 proposal だが同時期に標準化）

**Files:** `wasm/ir.ts`, `wasm/codegen.ts`, `wasm/opcodes.ts`, `dsl/namespaces.ts`, `dsl/expr.ts`

**テスト:** `NaN` → `0`, `+Infinity` → `i32.MAX`, `-Infinity` → `i32.MIN` の検証。

---

### W-06: Multi-Value Blocks
**Tier 2** | Deps: なし

`if`/`block` から複数値を返す。現状は関数レベルの multi-value のみ。

**仕様:**
- `if` ノードの `type` フィールドを `WasmValType | WasmValType[] | null` に拡張
- `block` ノードに `type` フィールド追加（現状なし）
- codegen: block/if の type annotation で `0x60` + param/result count を使用（multi-value block type は type section 参照）
- DSL: `Ctrl.if(cond).then<[i32, i32]>(body).else(body)` — tuple 型で戻り値型を指定

**制約:** codegen が block type を type index で参照する必要があり、module builder との連携が複雑。

**Files:** `wasm/ir.ts`, `wasm/codegen.ts`, `wasm/module.ts`, `dsl/namespaces.ts`

**テスト:** if ブロックから 2 値を返し、両方を local に格納して検証。

---

### W-07: Tail Calls
**Tier 2** | Deps: なし

`return_call` / `return_call_indirect` で末尾呼び出し最適化。深い再帰でスタックオーバーフローを回避。

**仕様:**
- 2 命令: `return_call`(0x12), `return_call_indirect`(0x13)
- IR ノード: `{ op: "return_call", idx, args[] }`, `{ op: "return_call_indirect", typeIdx, tableIdx, args[], indexExpr }`
- codegen: call と同じだが opcode が異なる
- DSL: `funcRef.tail(...args)` — return_call を生成。末尾位置でのみ使用可
- capabilities: `"tail-call"` feature 検出

**Files:** `wasm/ir.ts`, `wasm/codegen.ts`, `wasm/opcodes.ts`, `dsl/namespaces.ts`, `dsl/expr.ts`, `wasm/capabilities.ts`

**テスト:** 100万回の相互再帰が stack overflow せずに完了するテスト。

---

### W-08: f32 DSL ラッパー
**Tier 1** | Deps: なし

`Mem.i32()`, `Mem.i64()`, `Mem.f64()` はあるが `Mem.f32()` がない。f32 定数生成の DSL ラッパー。

**仕様:**
- `Mem.f32(v: number)` — `ChainableExpr<"f32">` を返す。内部で `IR.const_f32(v)` 生成
- トップレベル `f32(v)` エイリアス（`i32`, `i64`, `f64` と同様）
- `f32Array(base?)` — i32Array と同等の f32 配列ヘルパ
  - `.load(idx)`: `ChainableExpr<"f32">`
  - `.store(idx, val)`: `FuncGen<void>`
  - `.at(idx)`: `FieldAccessor<"f32">`

**Files:** `dsl/namespaces.ts`（Mem.f32, f32Array）, `dsl/compiler.ts`（f32 エクスポート）

**テスト:** f32 定数の生成、f32Array の read/write round-trip。

---

### W-09: i16 メモリ操作の DSL 完備
**Tier 2** | Deps: なし

`load16s`, `load16u`, `store16` は存在するが、i16Array ヘルパがない。

**仕様:**
- `Mem.i16Array(base?)` — u16 配列ヘルパ
  - `.load(idx)`: `ChainableExpr<"i32">`（load16u, stride=2）
  - `.loadSigned(idx)`: `ChainableExpr<"i32">`（load16s）
  - `.store(idx, val)`: `FuncGen<void>`（store16, stride=2）
  - `.at(idx)`: `FieldAccessor<"i32">`
- `Mem.i8Array(base?)` — u8 配列ヘルパ（byte 配列の型付きアクセス）
  - `.load(idx)`: `ChainableExpr<"i32">`（load8u, stride=1）
  - `.store(idx, val)`: `FuncGen<void>`（store8, stride=1）

**Files:** `dsl/namespaces.ts`

**テスト:** i16Array, i8Array の read/write round-trip。

---

### W-10: Global の Import/Export
**Tier 2** | Deps: なし

現状 `Mod.import` は関数のみ。Global の import/export を追加。

**仕様:**
- `Mod.importGlobal(module, name, type, mutable?)` — グローバル変数をインポート
- `Mod.exportGlobal(name, globalRef)` — グローバル変数をエクスポート
- Module builder: Import Section に global import（kind=0x03）追加
- Module builder: Export Section に global export（kind=0x03）追加

**Files:** `wasm/module.ts`, `dsl/namespaces.ts`, `dsl/interpreter.ts`

**テスト:** JS から mutable global をインポートし、Wasm 内で変更、JS から読み取り検証。

---

### W-11: Custom Section（Name Section）
**Tier 3** | Deps: なし

デバッグツール（Chrome DevTools 等）で関数名を表示するための name section。

**仕様:**
- Section 0 (custom) に "name" セクションを emit
- Sub-section 1: Function names（関数インデックス → 名前マッピング）
- Sub-section 2: Local names（オプション）
- `compile()` に `{ debug: true }` オプションで有効化

**Files:** `wasm/module.ts`, `dsl/compiler.ts`

**テスト:** `WebAssembly.Module.customSections(module, "name")` で name section の存在確認。

---

### W-12: Multiple Tables
**Tier 3** | Deps: なし

複数の関数テーブルを宣言可能にする。現状は単一テーブルのみ。

**仕様:**
- `Mod.table(funcs[], { index?: number })` — テーブルインデックス指定
- `call_indirect` の `tableIdx` フィールドを活用（IR には既にある）
- Module builder: 複数 Table セクション、複数 Element セクション対応

**Files:** `wasm/module.ts`, `dsl/namespaces.ts`

**テスト:** 2 つのテーブルを使い分ける間接呼び出しテスト。

---

### W-13: Memory Import
**Tier 2** | Deps: なし

外部からメモリをインポートする。SharedArrayBuffer との連携に必要。

**仕様:**
- `Mod.importMemory(module, name, { min, max?, shared? })` — メモリインポート
- `Mod.memory()` との排他制約（import と宣言は共存不可）
- Module builder: Import Section に memory import（kind=0x02）追加

**Files:** `wasm/module.ts`, `dsl/namespaces.ts`, `dsl/interpreter.ts`

**テスト:** JS 側で `new WebAssembly.Memory()` を作成し、Wasm にインポートして共有。

---

### W-14: i64 Bitwise/Comparison の DSL 完備
**Tier 1** | Deps: なし

`Op.i64` に bitwise ops と unsigned comparisons を追加。IR/codegen は対応済みだが DSL ラッパーが不完全。

**仕様:**
- `Op.i64` に追加: `and`, `or`, `xor`, `shl`, `shr`, `shr_u`, `div_u`, `rem_u`, `rem`
- `Op.i64` に unsigned comparisons 追加: `lt_u`, `gt_u`, `le_u`, `ge_u`（一部は既存の可能性あり、要確認）
- `WasmRef<"i64">` / `ChainableExpr<"i64">` のチェインメソッド確認・補完

**Files:** `dsl/namespaces.ts`, `dsl/expr.ts`（メソッド追加が必要な場合）

**テスト:** i64 の bitwise AND/OR/XOR、shift、unsigned comparison の round-trip。

---

### W-15: f32/f64 完全演算の DSL 整備
**Tier 2** | Deps: W-08

f32/f64 の copysign, min, max を DSL からアクセス可能にする。

**仕様:**
- `Op.f32.copysign(a, b)`, `Op.f64.copysign(a, b)` — 符号コピー
- `Op.f32.min(a, b)`, `Op.f32.max(a, b)` — IEEE 754 min/max（NaN 伝搬）
- `Op.f64.min(a, b)`, `Op.f64.max(a, b)` — 同上
- `ChainableExpr<FloatType>` に `.copysign(other)` メソッド
- 注: `Op.min/max`（i32, select ベース）と `Op.f64.min/max`（f64, native 命令）は別物

**Files:** `dsl/namespaces.ts`, `dsl/expr.ts`

**テスト:** copysign の符号反転・保持テスト。NaN との min/max テスト。

---

---

## D: DSL 拡張

### D-01: 短絡評価ヘルパー
**Tier 1** | Deps: なし

`&&` / `||` に相当する短絡評価。ビット演算の `and`/`or` は両辺を評価するため、副作用がある式やコスト高い式で問題。

**仕様:**
- `Ctrl.logicalAnd(a, b)` — `if(a) { return b } else { return 0 }` に展開。`ChainableExpr<"i32">` を返す
- `Ctrl.logicalOr(a, b)` — `if(a) { return 1 } else { return b }` に展開
- `ChainableExpr<"i32">` に `.logicalAnd(other)`, `.logicalOr(other)` チェインメソッド
- 内部は `if` ノード（値返し）に展開

**Files:** `dsl/namespaces.ts`, `dsl/expr.ts`

**テスト:** 副作用のある式（メモリ書き込み）で、短絡時に第二引数が評価されないことを確認。

---

### D-02: 名前付きラベル
**Tier 2** | Deps: なし

`br(depth)` の数値指定はネスト深度でエラーしやすい。名前で参照可能にする。

**仕様:**
- `Ctrl.block(label, body)` / `Ctrl.loop(label, body)` — ラベル文字列をオプション引数で受け取る
- `Ctrl.br(label)` / `Ctrl.br_if(label, cond)` — ラベル文字列で分岐先を指定
- interpreter がラベル→depth のマッピングを管理
- 数値 depth と名前の混在を許容（後方互換）

**Files:** `dsl/namespaces.ts`, `dsl/interpreter.ts`

**テスト:** ネストした block/loop でラベル名による正しい分岐先解決。

---

### D-03: Tuple 型（Multi-Value 糖衣）
**Tier 3** | Deps: W-06

複数戻り値をタプルとして扱う DSL 抽象。

**仕様:**
- `Tuple.pack(a, b, ...)` — スタック上に複数値を置く
- `const [x, y] = yield* Tuple.unpack(callExpr, [Type.i32, Type.i32])` — 複数戻り値を分解
- 内部では multi-value return + local_set の IR に展開

**Files:** `dsl/namespaces.ts`, `dsl/types.ts`

**テスト:** 2 値を返す関数の戻り値を分解して使用。

---

### D-04: Array Body の自動 yield*
**Tier 3** | Deps: なし

`() => [...]` 配列記法は既にサポートされているが、`function*` body 内で `yield*` を手動で書く冗長さを軽減する追加パターン。

**現状の確認:** `() => [...]` は `VoidBody` として対応済み。追加が必要なのは式を返すパターン。

**仕様:**
- `Ctrl.if(cond).then(() => [stmts..., returnExpr])` — 最後の要素が式の場合、値付き if として扱う
- 既存の `function*` body との互換性を維持

**Files:** `dsl/namespaces.ts`（IfBuilder 拡張）

**テスト:** array body で値を返す if 式のテスト。

---

### D-05: ループ with break/continue
**Tier 2** | Deps: D-02

`Ctrl.while` / `Ctrl.for` 内で `break` / `continue` を直感的に書く。

**仕様:**
- `Ctrl.while(cond, function* (loop) { ... loop.break(); ... loop.continue(); })`
- `loop.break()` → `br(1)`（外側 block へ）
- `loop.continue()` → `br(0)`（loop の先頭へ）
- `Ctrl.for` でも同様のコールバック引数を追加

**Files:** `dsl/namespaces.ts`

**テスト:** break で早期脱出、continue でスキップするループのテスト。

---

### D-06: `WasmRef` の rotl/rotr メソッド
**Tier 1** | Deps: なし

`Op.i32.rotl/rotr` は存在するが、`WasmRef<"i32">` のチェインメソッドにない。

**仕様:**
- `WasmRef<IntType>` に `.rotl(n)`, `.rotr(n)` メソッド追加
- `ChainableExpr<IntType>` にも同様に追加

**Files:** `dsl/augment.ts`, `dsl/expr.ts`

**テスト:** CRC32 等のビット回転パターンで検証。

---

### D-07: `Mod.use` のバッチ版
**Tier 1** | Deps: なし

stdlib 関数を複数まとめてインポートする。

**仕様:**
- `const { memcpy, memset } = yield* Mod.useAll({ memcpy, memset })` — 複数 stdlib をまとめて use
- 内部で順に `Mod.use()` を呼ぶ糖衣

**Files:** `dsl/namespaces.ts`

**テスト:** 複数 stdlib を同時に use して動作確認。

---

### D-08: Assertions（コンパイル時 / ランタイム）
**Tier 2** | Deps: なし

デバッグ用のアサーション機構。

**仕様:**
- `Ctrl.assert(cond)` — 条件が false なら `unreachable` trap
- `Ctrl.assert(cond, errorCode)` — error code をメモリの規定位置に書いてから trap
- `compile()` の `{ assertions: false }` オプションで全 assert をストリップ（Meta.when 的な仕組み）

**Files:** `dsl/namespaces.ts`, `dsl/compiler.ts`

**テスト:** assert 成功時は何もしない、失敗時に trap。assertions: false で assert が除去される。

---

---

## S: Standard Library

### S-01: PRNG（疑似乱数生成）
**Tier 1** | Deps: なし

ゲーム・シミュレーションで必須。Xorshift32 を stdlib として提供。

**仕様:**
- `prng` stdlib: Wasm global 変数で state を保持
  - `seed(s: i32)`: state 初期化
  - `next()`: i32 乱数を返す（Xorshift32: `x ^= x << 13; x ^= x >> 17; x ^= x << 5`）
  - `nextInRange(min, max)`: `[min, max)` の範囲で i32 乱数
  - `nextF64()`: `[0.0, 1.0)` の f64 乱数（`next()` を `f64.convert_i32_u` して正規化）
- Module global で state 管理するため、`Mod.use(prng)` は global 宣言も含む

**Files:** `stdlib/prng.ts`（新規）, `stdlib/index.ts`

**テスト:** seed 設定後の再現性テスト。nextInRange の範囲内検証。nextF64 の [0,1) 範囲検証。

---

### S-02: GCD / LCM
**Tier 1** | Deps: なし

ユークリッドの互除法。example に実装があるが stdlib 未公開。

**仕様:**
- `gcd(a, b)` — ループ版ユークリッド互除法。`(i32, i32) -> i32`
- `lcm(a, b)` — `a / gcd(a, b) * b`（オーバーフロー軽減のため除算先行）
- `gcdI64(a, b)` — i64 版

**Files:** `stdlib/math.ts`（追加）

**テスト:** `gcd(12, 8) = 4`, `lcm(4, 6) = 12`, `gcd(0, 5) = 5`, `gcd(0, 0) = 0`

---

### S-03: Binary Search
**Tier 1** | Deps: なし

ソート済み i32 配列の二分探索。example に実装あり。

**仕様:**
- `binarySearch`: `(base, len, target) -> i32`（見つかった index、見つからなければ -1）
- `lowerBound`: `(base, len, target) -> i32`（target 以上の最小 index）
- `upperBound`: `(base, len, target) -> i32`（target より大きい最小 index）

**Files:** `stdlib/search.ts`（新規）

**テスト:** 見つかる/見つからないケース。重複要素での lower/upper bound の正確性。

---

### S-04: Merge Sort
**Tier 2** | Deps: なし

安定ソート。quicksort（既存）は不安定。

**仕様:**
- `mergeSort`: `(base, len, tmpBase) -> void` — i32 配列の安定ソート
- `tmpBase`: ワーク領域（len * 4 bytes 必要）
- ボトムアップ反復版（再帰不要）

**Files:** `stdlib/sort.ts`（追加）

**テスト:** 既にソート済み、逆順、ランダム、重複要素。安定性（同値要素の相対順序保持）。

---

### S-05: Counting Sort / Radix Sort
**Tier 3** | Deps: なし

整数特化の O(n) ソート。

**仕様:**
- `countingSort`: `(base, len, maxVal, tmpBase) -> void` — 値域が小さい場合に最適
- `radixSort`: `(base, len, tmpBase) -> void` — LSD radix sort (base 256, 4 pass for i32)

**Files:** `stdlib/sort.ts`（追加）

**テスト:** 大量データの正確性とパフォーマンス。

---

### S-06: 三角関数近似
**Tier 2** | Deps: なし

純 Wasm の sin/cos/tan/atan2 近似実装。

**仕様:**
- `sin(x: f64) -> f64` — テイラー級数 or CORDIC アルゴリズム。誤差 < 1e-6
- `cos(x: f64) -> f64` — `sin(x + PI/2)` or 独立実装
- `tan(x: f64) -> f64` — `sin(x) / cos(x)`
- `atan2(y, x) -> f64` — 象限を考慮した逆正接
- 全て range reduction 付き（入力を [-PI, PI] に正規化）

**Files:** `stdlib/trig.ts`（新規）

**テスト:** 0, PI/6, PI/4, PI/3, PI/2, PI 等の既知値。JS `Math.sin` との比較で誤差 < 1e-6。

---

### S-07: 対数・指数
**Tier 2** | Deps: なし

**仕様:**
- `log(x: f64) -> f64` — 自然対数。整数部は bitwise 操作、小数部は多項式近似
- `log2(x: f64) -> f64`
- `exp(x: f64) -> f64` — e^x。range reduction + 多項式近似
- `pow_f64(base, exp) -> f64` — `exp(exp * log(base))`

**Files:** `stdlib/math-f64.ts`（新規）

**テスト:** `log(1) = 0`, `log(E) = 1`, `exp(0) = 1`, `exp(1) ≈ E`。JS Math との比較。

---

### S-08: 固定小数点演算
**Tier 3** | Deps: なし

Q16.16 形式の固定小数点ヘルパ。float 演算を避けたい組み込み系ユースケース。

**仕様:**
- `Fixed` namespace:
  - `fromInt(n)` — `n << 16`
  - `fromF64(f)` — `f64 → i32` 変換（f * 65536 を truncate）
  - `toF64(fx)` — `i32 → f64`（fx / 65536.0）
  - `add(a, b)`, `sub(a, b)` — そのまま i32 加減算
  - `mul(a, b)` — `(a * b) >> 16`（i64 経由でオーバーフロー回避）
  - `div(a, b)` — `(a << 16) / b`（i64 経由）

**Files:** `stdlib/fixed.ts`（新規）

**テスト:** `Fixed.mul(fromInt(3), fromInt(4)) = fromInt(12)`。小数精度テスト。

---

### S-09: Bit Manipulation Utilities
**Tier 1** | Deps: なし

頻出ビット操作をまとめる。

**仕様:**
- `isPowerOf2(n)`: `n != 0 && (n & (n-1)) == 0`
- `nextPowerOf2(n)`: 次の 2 の冪
- `log2Floor(n)`: `31 - clz(n)`
- `bswap32(n)`: バイト順反転 `((n >> 24) & 0xFF) | ((n >> 8) & 0xFF00) | ((n << 8) & 0xFF0000) | (n << 24)`
- 全て inline 展開（stdlib function ではなく、`Expr` を返すヘルパ）

**Files:** `stdlib/bits.ts`（新規）

**テスト:** 各関数の境界値テスト。

---

### S-10: Modular Arithmetic
**Tier 3** | Deps: S-02

**仕様:**
- `modpow(base, exp, mod)` — 繰り返し二乗法による剰余べき乗
- `modinv(a, mod)` — 拡張ユークリッドによるモジュラ逆元

**Files:** `stdlib/math.ts`（追加）

**テスト:** 暗号系の既知値テスト（RSA の小さい例等）。

---

---

## データ構造（S-2x）

### S-20: Deque（双方向キュー）
**Tier 1** | Deps: なし

BFS の双方向拡張、sliding window パターンに必要。

**仕様:**
- `const dq = yield* Deque(base, capacity)` — 固定容量循環バッファベース
- `dq.pushFront(val)`, `dq.pushBack(val)`: 両端に追加
- `dq.popFront(dst)`, `dq.popBack(dst)`: 両端から取り出し
- `dq.notEmpty`: 条件式
- `dq.reset()`: クリア
- RingBuffer 同様、capacity が 2 の冪なら `and` でラップ

**Files:** `dsl/deque.ts`（新規）

**テスト:** front/back からの push/pop 交互操作。容量上限の wraparound。

---

### S-21: HashSet
**Tier 1** | Deps: なし

HashMap のキーのみ版。重複除去、メンバーシップ判定に使用。

**仕様:**
- `const hs = yield* HashSet(base, capacity)` — capacity は 2 の冪
- `hs.add(key)`: キー追加
- `hs.has(key)`: 存在判定（`ChainableExpr<"i32">`）
- `hs.delete(key)`: 削除
- `hs.clear()`: 全消去
- `hs.notEmpty`: 条件式
- 内部は HashMap と同一だが value 配列を省略（statuses + keys のみ）

**Files:** `dsl/hashset.ts`（新規）

**テスト:** add/has/delete の基本動作。ハッシュ衝突テスト。

---

### S-22: MaxHeap
**Tier 1** | Deps: なし

MinHeap の逆順版。比較演算を反転するだけ。

**仕様:**
- API は MinHeap と対称: `insert`, `extractMax`, `peekPriority`, `peekValue`, `notEmpty`, `reset`
- 内部実装: MinHeap の比較条件 (`lt` → `gt`) を反転

**代替案:** MinHeap にコンパレータ引数を追加してジェネリック化する方が良い可能性あり。
- `yield* Heap(base, { order: "min" | "max" })`

**Files:** `dsl/maxheap.ts`（新規）または `dsl/minheap.ts`（リファクタ）

**テスト:** 降順抽出テスト。

---

### S-23: Union-Find
**Tier 1** | Deps: なし

example に実装があるが stdlib 未公開。連結成分・クラスタリングに使用。

**仕様:**
- `const uf = yield* UnionFind(base, capacity)`
- `uf.init(n)`: 0..n-1 を個別集合で初期化
- `uf.find(x, dst)`: 根を返す（path compression 付き）
- `uf.union(x, y)`: 2 集合を結合（union by rank）
- `uf.same(x, y)`: 同じ集合か判定

**Files:** `dsl/union-find.ts`（新規）

**テスト:** union/find の正確性。path compression による find の一貫性。

---

### S-24: Segment Tree
**Tier 3** | Deps: なし

Range query / Range update を O(log n) で処理。

**仕様:**
- `const st = yield* SegmentTree(base, n)` — n 要素、内部で 4n サイズ確保
- `st.build(srcBase)`: 配列から構築
- `st.query(l, r, dst)`: 区間 [l, r) の合計（または min/max — パラメータ化）
- `st.update(idx, val)`: 単一要素更新
- 非再帰版（反復的 bottom-up 実装）

**Files:** `dsl/segment-tree.ts`（新規）

**テスト:** 区間和クエリ、点更新後の区間和再計算。

---

### S-25: Graph Adjacency List
**Tier 2** | Deps: なし

グラフアルゴリズムの基盤データ構造。CSR（Compressed Sparse Row）形式。

**仕様:**
- `const g = Graph(vertexBase, edgeBase, n, m)` — plain function（Generator 不要）
  - `vertexBase`: n+1 個の i32（各頂点の辺リスト開始位置）
  - `edgeBase`: m 個の i32（隣接頂点）
- `g.degree(v)`: 頂点 v の次数
- `g.neighbors(v)`: 開始位置と個数を返す（ループ用）
- `g.forEachNeighbor(v, body)`: 隣接頂点を iterate

**JS 側ヘルパ:** `buildCSR(n, edges: [u, v][])` — JS 配列から CSR を構築し、メモリに書き込む

**Files:** `dsl/graph.ts`（新規）, `runtime/graph-marshal.ts`（新規）

**テスト:** 小グラフの CSR 構築と隣接リスト走査。

---

### S-26: LRU Cache
**Tier 3** | Deps: なし

固定容量の Least Recently Used キャッシュ。HashMap + doubly-linked list。

**仕様:**
- `const cache = yield* LRUCache(base, capacity)` — capacity は 2 の冪
- `cache.get(key, dst)`: ヒットなら値を dst に書いて 1、ミスなら 0
- `cache.put(key, val)`: 挿入。容量超過時は LRU を削除
- `cache.clear()`: 全消去

**Files:** `dsl/lru-cache.ts`（新規）

**テスト:** 容量超過時の eviction テスト。アクセス順序による LRU 更新。

---

### S-27: Sorted Array（簡易版 BTree 代替）
**Tier 3** | Deps: S-03

挿入時にソート順を維持する配列。小規模データでは BTree より実用的。

**仕様:**
- `const sa = yield* SortedArray(base, capacity)`
- `sa.insert(val)`: binary search で挿入位置を見つけ、memmove + 挿入
- `sa.has(val)`: binary search で存在判定
- `sa.delete(val)`: 見つけて memmove
- `sa.at(i)`: i 番目の要素

**Files:** `dsl/sorted-array.ts`（新規）

**テスト:** 挿入順序に関係なくソート済みが維持されること。

---

---

## R: ランタイム

### R-01: Memory Growth 対応
**Tier 1** | Deps: なし

`memory.grow` 後に `TypedArray` の view が無効化される問題への対策。

**仕様:**
- `instantiate()` の返り値に `refreshViews()` メソッド追加
- `refreshViews()`: `memory.buffer` から `mem`/`bytes` を再生成
- または Proxy ベースで自動的に buffer 変更を検出

**代替案:** `Object.defineProperty` で `mem` getter を定義し、毎回 `new Int32Array(memory.buffer)` を返す（パフォーマンスへの影響を検討）

**Files:** `runtime/instantiate.ts`

**テスト:** `memory.grow` 後に view が有効なままアクセスできること。

---

### R-02: Streaming Instantiation
**Tier 2** | Deps: なし

`WebAssembly.instantiateStreaming` を使った高速インスタンス化。

**仕様:**
- `instantiateFromUrl<T>(url, imports?)` — fetch + instantiateStreaming
- `instantiateFromResponse<T>(response, imports?)` — Response オブジェクトから
- TypeScript 型は既存の `instantiate` と同じ返り値

**Files:** `runtime/instantiate.ts`（追加）

**テスト:** ブラウザ環境テスト（Playwright E2E）。

---

### R-03: Import Mock Framework
**Tier 2** | Deps: なし

テスト用に import 関数をモック化。

**仕様:**
- `mockImports(binary)` — バイナリの import セクションを解析し、モック関数を自動生成
- `mockImports(binary, { env: { log: vi.fn() } })` — 特定のモック指定 + 残りは自動
- 自動生成: 戻り値なし関数は no-op、i32 戻り値は `() => 0`

**Files:** `runtime/mock.ts`（新規）

**テスト:** import 付きモジュールのモック化テスト。

---

### R-04: Memory Dump / State Snapshot
**Tier 2** | Deps: なし

デバッグ用のメモリ状態スナップショット。

**仕様:**
- `dumpMemory(instance, offset, length)` — hex + ASCII 形式のメモリダンプ文字列
- `snapshotMemory(instance, offset, length)` — Uint8Array のコピー
- `diffMemory(a, b)` — 2 つのスナップショットの差分レポート

**Files:** `runtime/debug-utils.ts`（新規）

**テスト:** メモリ書き込み前後の diff 検証。

---

### R-05: Canvas Pixel Sync Helper
**Tier 2** | Deps: なし

ImageData ↔ Wasm メモリの双方向同期ユーティリティ。

**仕様:**
- `writeImageData(bytes, offset, imageData)` — ImageData.data → Wasm メモリ
- `readImageData(bytes, offset, width, height)` — Wasm メモリ → ImageData
- `syncCanvas(ctx, instance, offset, width, height)` — 一括 read + putImageData
- メモリレイアウト: RGBA packed（4 bytes/pixel）

**Files:** `runtime/canvas.ts`（新規）

**テスト:** 既知パターンの画像データ round-trip テスト。

---

### R-06: Color Utilities
**Tier 3** | Deps: なし

色空間変換。DSL 内で Wasm 関数として、またはランタイム JS ヘルパとして。

**仕様:**
- Wasm stdlib 版:
  - `rgbToHsl(r, g, b, dstH, dstS, dstL)`: f64 演算
  - `hslToRgb(h, s, l, dstR, dstG, dstB)`: f64 演算
- JS runtime 版:
  - `rgbToHex(r, g, b)`: `#RRGGBB` 文字列
  - `hexToRgb(hex)`: `{ r, g, b }`
  - `lerpColor(c1, c2, t)`: 色の線形補間

**Files:** `stdlib/color.ts`（新規）, `runtime/color.ts`（新規）

**テスト:** 既知の RGB↔HSL 変換値テスト。

---

---

## T: Tooling / Debug

### T-01: Dead Code Detection
**Tier 2** | Deps: なし

未到達コードの検出。

**仕様:**
- `detectDeadCode(funcs: FuncDef[])` — IR を走査し、`return`/`br`/`unreachable` の後にあるコードを検出
- 返り値: `{ funcIndex, stmtIndex, reason }[]`
- `formatDeadCode(results)` で人間可読出力

**Files:** `wasm/dead-code.ts`（新規）

**テスト:** return 後のコード、到達不能ブランチの検出。

---

### T-02: Call Graph Analysis
**Tier 3** | Deps: なし

関数間の呼び出し関係を分析。

**仕様:**
- `buildCallGraph(funcs: FuncDef[])` — `Map<number, Set<number>>`（caller → callees）
- `findRecursion(graph)` — 再帰（直接/間接）の検出
- `findUnusedFunctions(graph, exports)` — export からも内部呼び出しからも到達不能な関数

**Files:** `wasm/call-graph.ts`（新規）

**テスト:** 相互再帰の検出。未使用関数の正確な特定。

---

### T-03: Performance Regression Tracking
**Tier 3** | Deps: なし

ベンチマーク結果の永続化と回帰検出。

**仕様:**
- `bench()` の結果を JSON ファイルに保存するオプション
- `compareBenchmarks(baseline, current)` — 閾値超過の検出
- CI 連携用の exit code（回帰検出時に非 0）

**Files:** `bench.ts`（拡張）, `runtime/bench-history.ts`（新規）

**テスト:** ベンチマーク結果の保存・比較ロジックのユニットテスト。

---

### T-04: Wasm Assertion Helper（ランタイム）
**Tier 2** | Deps: D-08

Wasm 内のアサーション結果を JS 側で読み取れる仕組み。

**仕様:**
- `Ctrl.assert` が失敗時にメモリの規定位置（例: offset 0）に error code を書き込む
- `runtime/assertions.ts`:
  - `assertNoTraps(instance, fn, args)` — trap が発生しないことを assert
  - `assertTraps(instance, fn, args)` — trap が発生することを assert
  - `getLastAssertionError(instance)` — 最後の assert error code 読み取り

**Files:** `runtime/assertions.ts`（新規）

**テスト:** assert 成功/失敗時の JS 側ハンドリングテスト。

---

### T-05: Source Map / Debug Annotations
**Tier 3** | Deps: W-11

DSL のソース位置と Wasm バイトコード位置のマッピング。

**仕様:**
- `compile()` に `{ sourceMap: true }` オプション
- Source map v3 形式で出力
- DSL generator のソース行 → WAT 行 → Wasm byte offset のマッピング
- `compileWithSourceMap()` — `{ binary, sourceMap, wat }` を返す

**Files:** `dsl/compiler.ts`, `wasm/source-map.ts`（新規）

**テスト:** ソースマップの位置精度テスト。

---

### T-06: Fuzzing Framework
**Tier 3** | Deps: なし

Property-based testing 用の入力生成。

**仕様:**
- `fuzz(fn, { iterations, generator })` — ランダム入力で関数を繰り返し実行
- 組み込みジェネレータ: `Gen.i32()`, `Gen.i32Range(min, max)`, `Gen.f64()`, `Gen.array(gen, len)`
- Wasm trap 検出（try-catch でインスタンス例外をキャッチ）
- 失敗ケースの shrinking（簡略化）

**Files:** `runtime/fuzz.ts`（新規）

**テスト:** 既知のバグパターンを fuzz で検出するデモ。

---

---

## アルゴリズム例題の追加（S-4x）

stdlib 昇格候補のアルゴリズムを example として先に実装し、安定したら stdlib に移動する戦略。

### S-40: Matrix Operations
**Tier 2** | Deps: なし

matmul は example にあるが、transpose / determinant がない。

**仕様:**
- `matTranspose(src, dst, rows, cols)`: 転置（i32）
- `matMulF64(a, b, dst, m, n, k)`: f64 行列乗算
- `matScale(src, dst, rows, cols, scalar)`: スカラー倍

**Files:** `stdlib/matrix.ts`（新規）

**テスト:** 単位行列の転置、既知行列の乗算結果。

---

### S-41: BFS / DFS
**Tier 2** | Deps: S-25

グラフ走査の汎用実装。

**仕様:**
- `bfs(graph, start, visitedBase, queueBase)`: BFS で到達可能頂点を visited に記録
- `dfs(graph, start, visitedBase, stackBase)`: DFS 版
- callback 版: `bfsWithCallback(graph, start, onVisit)` — visit 時に call_indirect

**Files:** `stdlib/graph.ts`（新規）

**テスト:** 連結グラフの全頂点到達。非連結グラフの未到達頂点確認。

---

### S-42: Dijkstra
**Tier 2** | Deps: S-25, MinHeap（既存）

最短経路アルゴリズム。example にあるが stdlib 未公開。

**仕様:**
- `dijkstra(graph, weightBase, start, distBase, heapBase)`: 単一始点最短経路
- weightBase: 辺の重み配列（CSR のエッジ順序に対応）
- distBase: 結果の距離配列

**Files:** `stdlib/graph.ts`（追加）

**テスト:** 既知グラフの最短距離検証。

---

### S-43: String Matching (KMP)
**Tier 3** | Deps: なし

Knuth-Morris-Pratt アルゴリズム。

**仕様:**
- `kmpSearch(text, textLen, pattern, patLen, failureBase)`: 最初のマッチ位置を返す（-1 = not found）
- `kmpBuildFailure(pattern, patLen, failureBase)`: failure 関数テーブル構築

**Files:** `stdlib/string-algo.ts`（新規）

**テスト:** パターンの先頭/中間/末尾/未検出の各ケース。

---

---

## V: 静的解析・コンパイル時検証

現状の wasmize は **「DSL compiler は IR を生成するだけ、検証は Wasm engine に任せる」** 設計。
`WebAssembly.compile()` 時の Wasm validation error は「offset 0x2F で型が不一致」のような低レベルメッセージで、DSL のどこが間違っているか全くわからない。
コンパイル時に検出可能なエラーを DSL 層で事前に捕捉し、意味のあるエラーメッセージを出すことが目標。

---

### V-01: メモリバジェット検証
**Tier 1** | Deps: なし

BumpAllocator の確保量と `Mod.memory(pages)` の宣言量の整合性チェック。

**問題:** allocator で 3 ページ分確保したのに `Mod.memory(1)` と宣言 → 2/3 のデータがアクセス不能（trap）。サイレントに壊れる。

**仕様:**
- `compile()` 内で、全 allocator の `requiredPages` と宣言された `memoryPages` を比較
- `allocator.requiredPages > memoryPages` なら `CompileError` を throw
- エラーメッセージ: `"Memory budget exceeded: allocations require ${req} pages but only ${decl} pages declared"`
- data segment も検証: `segment.offset + segment.init.length > memoryPages * 65536` なら error
- `Mod.memory()` 省略時は allocator の `requiredPages` を自動採用（明示宣言不要に）

**Files:** `dsl/interpreter.ts`（Phase 3 で検証挿入）, `dsl/allocator.ts`（requiredPages 公開確認）

**テスト:** 不足ページで CompileError。自動ページ計算の正確性。data segment 超過の検出。

---

### V-02: Export 名衝突検出
**Tier 1** | Deps: なし

同名 export の上書きをコンパイル時にエラーにする。

**問題:** 2 つの関数を同じ名前で export → 後者がサイレントに上書き。

**仕様:**
- interpreter の export 処理で、名前の `Set` を管理
- 重複検出時に `CompileError`: `"Duplicate export name: '${name}'"`
- `Mod.exportAll()` 内でも同様にチェック

**Files:** `dsl/interpreter.ts`

**テスト:** 同名 export で CompileError。異なる名前は正常通過。

---

### V-03: 関数呼び出し Arity チェック
**Tier 1** | Deps: なし

関数呼び出し時の引数数ミスマッチ検出。

**問題:** 2 引数の関数を 3 引数で呼ぶ → Wasm validation error（低レベルメッセージ）。

**仕様:**
- `CallableFunc` 呼び出し時に、登録済みの param count と実引数数を比較
- ミスマッチ時: `CompileError`: `"Function '${name}' expects ${expected} arguments but got ${actual}"`
- `call_indirect` は型テーブル参照で検証（テーブル関数のシグネチャが既知の場合）

**Files:** `dsl/namespaces.ts`（CallableFunc の呼び出しラッパー）, `dsl/expr.ts`

**テスト:** 引数過多/過少で CompileError。正しい引数数は正常通過。

---

### V-04: 型ミスマッチ検出（binop/cmp レベル）
**Tier 1** | Deps: なし

i32 と i64 の混合演算をコンパイル時に検出。

**問題:** `i64_ref.add(i32_ref)` → `type` フィールドが省略され i32.add が emit → **値が黙って壊れる**（trap すらしない）。

**仕様:**
- `WasmRef<T>` の演算メソッド（`.add()`, `.sub()` 等）で、引数の型を推定・検証
- `WasmRef<"i64">.add(WasmRef<"i32">)` → `CompileError`: `"Type mismatch: cannot add i64 and i32. Use explicit conversion (e.g., .toI64())"`
- ChainableExpr のチェインでも型追跡を維持
- 既存の TS 型レベル制約（`this: WasmRef<IntType>` 等）に加え、ランタイムチェックを追加

**設計判断:** TS の型システムだけでは防げないケース（`ExprInput` が `number | WasmRef<any>` の union）があるため、`resolve()` 時のランタイム型チェックが必要。

**Files:** `dsl/expr.ts`（resolve 内に型チェック追加）, `dsl/augment.ts`

**テスト:** i32 + i64 で CompileError。同型演算は正常。number リテラルは暗黙変換 OK。

---

### V-05: br depth 検証
**Tier 2** | Deps: なし

ブロックネスト深度を超える `br` / `br_if` の検出。

**問題:** `br(3)` だがネストが 2 段 → Wasm validation error。

**仕様:**
- interpreter が block/loop のネスト深度をカウンター管理
- `Ctrl.br(depth)` / `Ctrl.br_if(depth, cond)` 呼び出し時に `depth < nestingLevel` を検証
- 違反時: `CompileError`: `"br depth ${depth} exceeds block nesting level ${level}"`
- `br_table` の全ラベルも同様に検証

**Files:** `dsl/interpreter.ts`（ネストカウンター追加）

**テスト:** 深度超過で CompileError。正しい深度は正常通過。

---

### V-06: ローカル変数インデックス検証
**Tier 2** | Deps: なし

存在しないローカル変数への参照の検出。

**問題:** IR 直接操作で `local_get(999)` → Wasm validation error。

**仕様:**
- `FuncContext` が宣言済みローカル数を追跡（既存）
- `local_get` / `local_set` / `local_tee` の IR 生成時に、インデックスが `params.length + locals.length` 未満であることを検証
- DSL 経由（`WasmRef`）では自動的に安全だが、IR 直接操作（intercept 等）に対するガードネット

**Files:** `dsl/interpreter.ts`

**テスト:** 範囲外インデックスで CompileError。

---

### V-07: Data Segment 重複・境界検証
**Tier 2** | Deps: なし

Data segment の重複書き込みと境界超過の検出。

**仕様:**
- interpreter が全 data segment の `[offset, offset + length)` 範囲を収集
- 重複検出: 2 つの segment の範囲が重なる場合に warning（error ではなく warning — 意図的な上書きもあり得る）
- 境界検出: `offset + length > memoryPages * 65536` なら `CompileError`
- `Mod.data()` / `Mod.dataString()` 呼び出し時に検証

**Files:** `dsl/interpreter.ts`

**テスト:** 重複 segment で warning。境界超過で CompileError。

---

### V-08: Allocator 領域重複検出
**Tier 2** | Deps: なし

複数の BumpAllocator 使用時、または手動ベースアドレスとの重複検出。

**仕様:**
- `MemoryRegion` トラッキング: `{ label: string, offset: number, size: number }`
- `Mod.allocator()` が返す allocator に region 登録メカニズム追加
- `Mem.i32Array(base)` の手動 base 指定時も region 登録
- `compile()` の Phase 3 で全 region の重複チェック
- 重複時: `CompileError`: `"Memory region overlap: '${a.label}' [${a.offset}..${a.end}) and '${b.label}' [${b.offset}..${b.end})"`

**Files:** `dsl/allocator.ts`, `dsl/interpreter.ts`

**テスト:** 重複する手動ベースアドレスで CompileError。allocator 経由は重複しないことの確認。

---

### V-09: Struct フィールド名 Typo 検出
**Tier 1** | Deps: なし

存在しないフィールドへのアクセスをコンパイル時にエラーにする。

**問題:** `point.at(i).xpos` — `xpos` は存在しないが Proxy が `undefined` を返し、後続で謎のエラーになる。

**仕様:**
- `StructAccessor` の Proxy handler で、`get` trap に未知フィールド名の検出を追加
- 未知フィールド時: `CompileError`: `"Unknown field '${name}' on Struct. Available fields: ${Object.keys(fields).join(", ")}"`
- `StructArray.get(i, field)` / `StructArray.set(i, field, val)` も同様にチェック

**Files:** `dsl/struct.ts`

**テスト:** typo フィールドで CompileError。正しいフィールドは正常。

---

### V-10: 関数戻り値型の整合性チェック
**Tier 2** | Deps: なし

関数 body の実際の戻り値型と宣言された結果型の不一致検出。

**問題:** 関数が i64 を返すべきなのに body が i32 を返す → 型不一致で Wasm validation error。

**仕様:**
- `Mod.func` / `Mod.exportFunc` の results 宣言と、body の最終式の `inferType()` 結果を比較
- ミスマッチ時: `CompileError`: `"Function return type mismatch: declared ${declared} but body returns ${actual}"`
- void 関数が値を返す場合、値返し関数が void の場合も検出
- `coerceReturn()` 適用後の型を検証

**Files:** `dsl/interpreter.ts`

**テスト:** 戻り値型不一致で CompileError。暗黙 coercion 後の型一致は正常。

---

### V-11: 定数式の事前評価とオーバーフロー検出
**Tier 3** | Deps: なし

コンパイル時に確定する定数式のオーバーフロー検出。

**仕様:**
- optimizer の constant-folding パス拡張: fold 結果が i32 範囲外なら warning
- `Mem.i32(v)` で `v > 2^31 - 1` or `v < -2^31` なら `CompileError`
- f64 の NaN/Infinity リテラルへの warning（意図的でない可能性）

**Files:** `wasm/optimizer-passes.ts`, `dsl/namespaces.ts`

**テスト:** i32 範囲外定数で CompileError。

---

### V-12: 未使用ローカル変数警告
**Tier 3** | Deps: なし

宣言されたが一度も参照されないローカル変数への warning。

**仕様:**
- interpreter が各 local の `local_get` / `local_set` カウントを追跡
- 一度も get/set されない local に対して warning（error ではない — デバッグ中に一時的に未使用はよくある）
- `compile({ warnings: false })` で抑制可能

**Files:** `dsl/interpreter.ts`

**テスト:** 未使用 local で warning 出力。使用 local は warning なし。

---

### V-13: コンパイル時メモリ境界の静的解析
**Tier 2** | Deps: V-01

定数アドレスのメモリアクセスが宣言ページ内に収まるかの静的検証。

**仕様:**
- `Mem.load(addr)` / `Mem.store(addr, val)` で `addr` が定数（`const_i32`）の場合:
  - `addr + sizeof(type) > memoryPages * 65536` なら `CompileError`
- `Mem.i32Array(base).load(idx)` で base と idx が共に定数の場合:
  - `base + idx * 4 + 4 > memoryPages * 65536` なら `CompileError`
- 動的アドレスは検証スキップ（実行時の bounds check guard に委ねる）

**Files:** `dsl/interpreter.ts`（IR emit 後の post-processing）

**テスト:** 定数アドレス超過で CompileError。動的アドレスは正常通過。

---

### V-14: `compile()` の Diagnostic API
**Tier 1** | Deps: V-01〜V-13 の基盤

検証結果を構造化された Diagnostic オブジェクトとして収集・出力する統一 API。

**仕様:**
- `Diagnostic` 型: `{ level: "error" | "warning" | "info", code: string, message: string, location?: { func?: string, stmt?: number } }`
- `compile()` のオプション:
  - `{ diagnostics: true }` — error 以外も収集して返す（error は throw せず DiagnosticResult に含める）
  - `{ strict: true }` — warning も error に昇格
  - `{ warnings: false }` — warning を抑制
- `compileWithDiagnostics(program, options)` — `{ binary?: WasmBinary<T>, diagnostics: Diagnostic[] }` を返す
- 各 V-xx 項目が Diagnostic を emit する形に統一

**Files:** `dsl/diagnostics.ts`（新規）, `dsl/compiler.ts`（compile オプション拡張）

**テスト:** 複数の問題を含むプログラムで全 diagnostic が収集されること。strict モードで warning が error 化。

---

## 実装順序ガイド

### Phase 0: 静的解析基盤（Phase 1 より先に実施）
0. **V-14** (Diagnostic API) — 全検証の基盤
1. **V-01** (メモリバジェット) — 最もよくあるバグの防止
2. **V-02** (export 名衝突) — 低コスト実装
3. **V-03** (arity チェック) — DSL 経由なら型で防げるが IR 直接操作の safety net
4. **V-04** (型ミスマッチ) — サイレントな値破壊の防止
5. **V-09** (struct field typo) — Proxy の trap 1 行追加

### Phase 1: 低コスト高インパクト（既存基盤の完備）
- **W-08** (f32 ラッパー) — 定数追加のみ
- **W-14** (i64 DSL 完備) — ラッパー追加のみ
- **W-01** (start section) — module builder に 1 セクション追加
- **W-02** (sign-extension) — opcodes 定義済み、接続のみ
- **D-06** (rotl/rotr メソッド) — augment に追加
- **D-07** (Mod.useAll) — 糖衣構文
- **S-09** (bit utils) — inline ヘルパ
- **S-02** (GCD/LCM) — 小さい stdlib 関数
- **V-05** (br depth 検証) — ネストカウンター追加
- **V-06** (local index 検証) — 境界チェック追加
- **V-07** (data segment 検証) — 重複・境界チェック

### Phase 2: Bulk Memory + 主要データ構造
- **W-03** (bulk memory) — IR + codegen の新機能
- **S-01** (PRNG) — ゲーム・シミュレーション用
- **S-03** (binary search) — 汎用アルゴリズム
- **S-20** (Deque) — データ構造
- **S-21** (HashSet) — データ構造
- **S-22** (MaxHeap) — データ構造
- **S-23** (Union-Find) — データ構造
- **R-01** (memory growth) — ランタイム安定性
- **V-08** (allocator 領域重複) — メモリ安全性
- **V-10** (戻り値型検証) — 型安全性

### Phase 3: DSL 表現力向上
- **D-01** (短絡評価) — 制御フロー糖衣
- **D-05** (break/continue) — ループ制御
- **D-08** (assertions) — デバッグ支援
- **W-05** (saturating truncation) — 安全な型変換
- **W-10** (global import/export) — モジュール間連携
- **W-13** (memory import) — SharedArrayBuffer
- **D-02** (名前付きラベル) — コード可読性
- **W-15** (f32/f64 copysign等) — 浮動小数点完備
- **V-13** (定数アドレス静的検証) — メモリ安全性

### Phase 4: 高度な機能
- **W-04** (passive data segments) — 遅延ロード
- **W-06** (multi-value blocks) — 複雑な型フロー
- **W-07** (tail calls) — 再帰最適化
- **S-06** (三角関数) — 数学ライブラリ
- **S-07** (対数・指数) — 数学ライブラリ
- **S-04** (merge sort) — 安定ソート
- **S-25** (graph adjacency) — グラフ基盤
- **S-41** (BFS/DFS) — グラフ走査
- **S-42** (Dijkstra) — 最短経路

### Phase 5: ツーリング + エッジケース
- **T-01** (dead code detection) — 静的解析
- **T-04** (assertion runtime) — テスト支援
- **R-03** (import mock) — テスト支援
- **R-04** (memory dump) — デバッグ
- **R-05** (canvas sync) — 描画連携
- **W-09** (i16/i8 array helpers) — メモリ効率
- **W-11** (name section) — デバッグ
- **D-03** (tuple) — 高度な型
- **V-11** (定数オーバーフロー) — 数値安全性
- **V-12** (未使用 local 警告) — コード品質

### Phase 6: 専門機能
- **S-08** (fixed-point) — 特殊用途
- **S-10** (modular arithmetic) — 暗号系
- **S-05** (counting/radix sort) — 特化ソート
- **S-24** (segment tree) — 競プロ
- **S-26** (LRU cache) — キャッシュ
- **S-27** (sorted array) — 順序付きコレクション
- **S-43** (KMP) — 文字列検索
- **S-40** (matrix ops) — 線形代数
- **R-06** (color utils) — 画像処理
- **T-02** (call graph) — 静的解析
- **T-03** (perf regression) — CI
- **T-05** (source map) — デバッグ
- **T-06** (fuzzing) — テスト
- **W-12** (multiple tables) — 高度なモジュール
- **D-04** (array body 値返し) — DSL 便利機能

---

## 実装ガイドライン

### IR ノード追加パターン
```typescript
// 1. ir.ts — ノード型追加
export type IRNode = ... | { op: "new_op"; field: type };

// 2. ir.ts — ファクトリ追加
export const IR = {
  ...,
  new_op: (field: type): IRNode => ({ op: "new_op", field }),
};

// 3. codegen.ts — emitIR に case 追加
case "new_op":
  emitIR(enc, node.field);
  enc.byte(OP.new_opcode);
  break;

// 4. optimizer-passes.ts — visitChildren に case 追加
case "new_op":
  return { ...node, field: visit(node.field) };
```

### DSL ラッパー追加パターン
```typescript
// namespaces.ts — 式（pure）の場合
export const Op = {
  newOp: (a: ExprInput, b: ExprInput): FuncGen<WasmVal> =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.new_op(va._node, vb._node));
    })(),
};

// namespaces.ts — 文（statement）の場合
export const Mem = {
  newStmt: (addr: ExprInput, val: ExprInput): FuncGen<void> =>
    (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(val);
      yield { _type: "stmt", node: IR.new_stmt(va._node, vv._node) } as StmtInstruction;
    })(),
};
```

### Stdlib 関数追加パターン
```typescript
// stdlib/new-module.ts
import { Mod, Ctrl, Mem, local, param, Type } from "../dsl/compiler";
import type { StdlibFunc } from "./types";

export const myFunc: StdlibFunc = {
  name: "myFunc",
  params: [Type.i32, Type.i32],
  results: [Type.i32],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    // ... implementation ...
    return a.add(b);
  },
};
```

### データ構造追加パターン
```typescript
// dsl/new-ds.ts — Generator factory パターン
import { local, Type, Mem, Ctrl } from "./compiler";
import type { FuncGen, ExprInput, WasmRef, ChainableExpr } from "./types";

export interface NewDSHandle {
  insert(val: ExprInput): FuncGen<void>;
  remove(dst: WasmRef): FuncGen<void>;
  notEmpty: ChainableExpr<"i32">;
  reset(): FuncGen<void>;
}

export function* NewDS(base: number): FuncGen<NewDSHandle> {
  const state = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  return {
    insert: (val) => (function* () { ... })(),
    remove: (dst) => (function* () { ... })(),
    get notEmpty() { return state.gt(0); },
    reset: () => (function* () { yield* state.set(0); })(),
  };
}
```

### テスト追加パターン
```typescript
// __tests__/new-feature.test.ts
import { describe, test, expect } from "vitest";
import { compile, Mod, Mem, Ctrl, local, Type } from "wasmize/dsl/compiler";
import { instantiate } from "wasmize/runtime/instantiate";

describe("New Feature", () => {
  test("basic functionality", async () => {
    const binary = compile<{ testFn: (n: number) => number }>(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("testFn", { n: Type.i32 }, function* (n) {
        // ... test scenario ...
        return n;
      });
    });

    const { exports: { testFn } } = await instantiate(binary);
    expect(testFn(42)).toBe(42);
  });
});
```
