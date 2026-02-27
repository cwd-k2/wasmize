# wasmize

Generator ベースの DSL で定義したアルゴリズムを Wasm バイナリにコンパイルする TypeScript ライブラリ。
ランタイムや外部ツールチェイン（wasm-pack, Emscripten 等）を一切使わず、`IR → Optimizer → Codegen → Module Builder → LEB128 Encoder` の全レイヤーを純 TypeScript で実装しています。

## Architecture

```
WasmProgram ─→ compile() ─→ optimize() ─→ emitIR() ─→ buildModule() ─→ WasmBinary<T>
  (1. DSL)   (2. Interpreter)  (3. Optimizer)  (4. Codegen)  (5. Module + Encoder)
```

1. **DSL 層** — Generator ベース DSL + namespace API（`Mod`, `Op`, `Mem`, `Ctrl`, `Loc`）でアルゴリズムを宣言
2. **IR 層** — 41 種の `IRNode` discriminated union + `IR.*` ビルダー API
3. **Optimizer** — プラグイン式 9 パス（constant folding, strength reduction, dead code elimination 等）
4. **Codegen** — IR ノードを Wasm opcode に変換（`emitIR()`）
5. **Module Builder** — Type / Import / Function / Memory / Export / Code セクションを構築
6. **Encoder** — LEB128 エンコーディングで Wasm バイナリを出力

詳細: [docs/architecture.md](docs/architecture.md)

## Quick Start

```bash
pnpm install
pnpm run dev        # http://localhost:5173 で全問題を実行
pnpm run test       # vitest ユニットテスト
pnpm run test:e2e   # Playwright E2E テスト
pnpm run typecheck  # 型チェック
```

## Example

```typescript
import { compile, local, Type, Mod, Mem, Ctrl } from "wasmize/dsl/compiler";
import { instantiate } from "wasmize/runtime/instantiate";

// Fibonacci DP — Generator DSL でアルゴリズムを定義
const binary = compile<{ fib: (n: number) => number }>(function* () {
  const arr = Mem.i32Array();

  yield* Mod.exportFunc("fib", { n: Type.i32 }, function* (n) {
    const i = yield* local(Type.i32);

    yield* arr.store(0, 0);
    yield* arr.store(1, 1);

    yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
      yield* arr.store(i, arr.load(i.sub(1)).add(arr.load(i.sub(2))));
    });
    return yield* arr.load(n);
  });
});

// 型安全にインスタンス化 — fib の型は自動推論
const { exports: { fib } } = await instantiate(binary);
fib(10); // 55
```

## Features

- **Generator DSL** — `yield*` による直感的な合成、`compile<T>()` のファントム型で型安全な export
- **制御フロー糖衣** — `Ctrl.for`, `Ctrl.while`, `Ctrl.range`, `Ctrl.when`, `Ctrl.grid`, `Ctrl.switch`, `Ctrl.scope`
- **メモリ抽象** — `Mem.i32Array`, `Mem.i8Array`, `Mem.i16Array`, `Mem.i32Array2D`, `Mem.byteGrid` でストライド計算を隠蔽
- **Struct 型** — `Struct({ x: "i32", y: "f64", r: "u8" })` でメモリレイアウトを型安全に管理。`FieldAccessor` による OOP スタイルアクセス
- **Tuple（multi-value return）** — `Tuple.pack(a, b)` / `Tuple.unpack(call, [x, y])` で Wasm multi-value を活用
- **データ構造（14 種）** — Queue, Stack, RingBuffer, BitSet, MinHeap, MaxHeap, HashMap, HashSet, Deque, UnionFind, Graph (CSR), SortedArray, SegmentTree, LRUCache
- **stdlib（15 モジュール）** — math, math-f64, trig, mem, sort, sort-int, search, string-algo, matrix, color, bits, fixed, modular, prng, graph-algo
- **9 パスオプティマイザ** — constant folding, strength reduction, dead code elimination 等。カスタムパス追加可
- **Wasm spec 拡張** — sign-extension, bulk memory, passive data segments, tail calls, multi-value, mutable globals, name section, multiple tables
- **Capability Tracking** — MVP / Standard / All プリセットで Wasm feature 互換性を自動検出・検証
- **静的検証** — 定数オーバーフロー検出, 未使用ローカル警告, export 名衝突検出, Diagnostic API
- **高レベル API** — `wasmFunc()`（1 関数インライン）, `wasmize()`（宣言的モジュール）
- **ランタイム** — `instantiate()`, streaming instantiation, AsyncBridge, WorkerPool, Marshal, canvas sync, color utils, debug utils, assertions, graph marshal
- **JS メタプログラミング** — Config 配列展開、ファクトリ関数、`Meta.each/times/when/sum` マクロ
- **ツーリング** — WAT 出力, IR 統計, 最適化レポート, Generator Intercept, Profiling, Bounds Guard, call graph 解析, dead code 検出, source map 生成, fuzzing

## Problems & Examples

### アルゴリズム問題（15）

| #   | 名前           | アルゴリズム     | #   | 名前         | アルゴリズム   |
| --- | -------------- | ---------------- | --- | ------------ | -------------- |
| 1   | Tower of Hanoi | 再帰             | 9   | LCS          | 2D DP          |
| 2   | Fibonacci DP   | ボトムアップ DP  | 10  | Knapsack     | 0-1 ナップサック |
| 3   | Kadane         | 最大部分配列和   | 11  | Quicksort    | 分割統治       |
| 4   | Coin Change    | DP（最小コイン） | 12  | Flood Fill   | BFS + Queue    |
| 5   | Binary Search  | 二分探索         | 13  | LIS          | DP + 二分探索  |
| 6   | GCD            | ユークリッド     | 14  | N-Queens     | バックトラック |
| 7   | Sieve          | エラトステネス   | 15  | Union-Find   | 経路圧縮       |
| 8   | MatMul         | 行列乗算         | 16  | Edit Distance| DP             |

### Realworld Examples（11）

Grayscale, Sepia, Convolution, Histogram, Histogram Equalization, Erode/Dilate, CRC32, Game of Life, Particles, Maze BFS, Space Shooter

詳細: [docs/problems.md](docs/problems.md)

## Directory Structure

```
packages/
  core/                   # wasmize（npm publish 対象）
    src/
      dsl/                # Generator ベース DSL・データ構造 14 種・Diagnostics
      wasm/               # IR 定義・Codegen・Module Builder・Encoder・Optimizer・Call Graph・Source Map
      stdlib/             # 再利用可能 Wasm 関数ライブラリ（15 モジュール: math, trig, sort, search, graph 等）
      runtime/            # ホスト統合（instantiate, marshal, fuzz, canvas, debug, assertions 等）
      __tests__/          # ライブラリテスト
  showcase/               # @wasmize/showcase（private、core に依存）
    app/                  # ブラウザアプリ
    ui/                   # ブラウザ UI
    examples/
      problems/           # 15 アルゴリズム問題
      realworld/          # 11 実用例（画像処理、シミュレーション等）
      layer2/, layer3/    # 高レベル API 使用例
      advanced/           # データ構造・最適化・プロファイリング使用例
    game/                 # Space Shooter（Wasm DSL ゲーム）
    bench/                # パフォーマンスベンチマーク
    e2e/                  # Playwright E2E テスト
docs/                     # 技術ドキュメント
```

## Documentation

- [Architecture](docs/architecture.md) — コンパイルパイプライン・IR・Optimizer・高レベル API 詳細
- [Problems](docs/problems.md) — 16 問題 + 10 Realworld のカタログ
- [Metaprogramming](docs/metaprogramming.md) — JS メタプログラミングパターン
- [Testing](docs/testing.md) — テスト戦略と新規問題の追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分けと開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針

## License

MIT
