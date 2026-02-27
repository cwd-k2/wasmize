# Testing

## ユニットテスト（vitest）

**設定:** `vitest.workspace.ts` で workspace 全体のテストを管理

```bash
pnpm run test       # 全テスト実行（vitest run）
```

### テストパターン

各問題のテストは `packages/showcase/examples/problems/__tests__/` に配置され、共通のパターンに従います:

```typescript
import { describe, test, expect } from "vitest";
import { problemN_xxx } from "../xxx";
import { instantiate } from "wasmize/runtime/instantiate";

describe("Problem Name", () => {
  test.each([
    // テストケースの配列
  ])("description", async (input) => {
    // 1. コンパイル + インスタンス化（型は compile<T>() から自動推論）
    const {
      exports: { func_name },
      mem,
    } = await instantiate(problemN_xxx());

    // 2. メモリ操作（必要な場合）
    // mem に入力データを書き込み...

    // 3. 実行 & アサーション（キャスト不要）
    expect(func_name(args)).toBe(expected);
  });
});
```

### メモリを使う問題のテスト

メモリ上の配列に入力データを書き込む必要がある問題が多数あります（Kadane, Coin Change, Binary Search, GCD, MatMul, LCS, Knapsack, Quicksort, Flood Fill, LIS）。

```typescript
// Kadane: BASE = 1024 bytes → Int32Array index = 1024/4 = 256
const base = 1024 / 4;
arr.forEach((v, i) => {
  mem![base + i] = v;
});

// Coin Change: COIN_BASE = 2048 bytes → Int32Array index = 2048/4 = 512
const COIN_BASE = 2048 / 4;
coins.forEach((c, i) => {
  mem![COIN_BASE + i] = c;
});

// Binary Search: 先頭から
arr.forEach((v, i) => {
  mem![i] = v;
});
```

### import 付き問題のテスト

Hanoi は `env.effect_move` を import するため、インスタンス化時にコールバックを渡します。

```typescript
const moves: string[] = [];
const {
  exports: { hanoi },
} = await instantiate(problem1_hanoi(), {
  env: {
    effect_move: (from: number, to: number) => {
      moves.push(`${from}→${to}`);
    },
  },
});
```

### DSL sugar テスト

`packages/core/src/dsl/__tests__/sugar.test.ts` に DSL プリミティブ自体のテストがあります:

- `Op.select` — branchless 三項選択
- `Op.max` / `Op.min` — 値の大小比較
- `Mem.i32Array2D` — 2D 配列の load/store（base=0, base≠0）
- `Ctrl.switch` — 多方向分岐ビルダ（dense br_table / sparse if-else、default あり・なし）
- `i32Array.swap` — 要素交換
- `Mod.exportAll` — 一括 export

### 追加テストカテゴリ

| テストファイル                                  | 内容                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/dsl/__tests__/allocator.test.ts`           | BumpAllocator のオフセット・アラインメント・ページ計算                                                                 |
| `packages/core/src/dsl/__tests__/struct.test.ts`              | Struct フィールドレイアウト・load/store・StructArray                                                                   |
| `packages/core/src/dsl/__tests__/string.test.ts`              | 文字列埋め込み・strlen・比較                                                                                           |
| `packages/core/src/dsl/__tests__/data-segment.test.ts`        | Data Segment 初期化・読み出し                                                                                          |
| `packages/core/src/dsl/__tests__/call-indirect.test.ts`       | 関数テーブル・間接呼び出し                                                                                             |
| `packages/core/src/dsl/__tests__/bounds.test.ts`              | デバッグモード境界チェック                                                                                             |
| `packages/core/src/dsl/__tests__/import-group.test.ts`        | `Mod.importGroup()` 一括インポート                                                                                     |
| `packages/core/src/wasm/__tests__/wat.test.ts`                | WAT 出力の正確性                                                                                                       |
| `packages/core/src/__tests__/marshal.test.ts`                 | JS ↔ Wasm データ転送                                                                                                   |
| `packages/core/src/__tests__/inline.test.ts`                  | wasmFunc() Layer 3 API                                                                                                 |
| `packages/core/src/__tests__/declarative.test.ts`             | wasmize() Layer 2 API                                                                                                  |
| `packages/core/src/__tests__/debug.test.ts`                   | IR 可視化・メタデータ                                                                                                  |
| `packages/core/src/__tests__/async-bridge.test.ts`            | Effect → Async 変換                                                                                                    |
| `packages/core/src/__tests__/worker-pool.test.ts`             | 並列 Wasm 実行 + WorkerState 型安全性 + タスク dedup                                                                   |
| `packages/core/src/__tests__/bench.test.ts`                   | ベンチマークハーネス                                                                                                   |
| `packages/core/src/dsl/__tests__/intercept.test.ts`           | Generator Intercept（co-routine proxy, トレース, モジュール変換, 合成ユーティリティ）                                  |
| `packages/core/src/dsl/__tests__/instrument.test.ts`          | 命令プロファイル（withProfiling, createProfile）                                                                       |
| `packages/core/src/dsl/__tests__/guard.test.ts`               | メモリ境界ガード（withBoundsCheck, OOB トラップ）                                                                      |
| `packages/core/src/wasm/__tests__/optimizer-passes.test.ts`   | プラグイン式オプティマイザ（visitChildren, カスタムパス, パス除外, builtinPasses）                                     |
| `packages/core/src/wasm/__tests__/capabilities.test.ts`       | Capability Tracking（scanFeatures, validateFeatures, Feature presets, compile target, describeFeature, suggestTarget） |
| `packages/core/src/wasm/__tests__/ir-stats.test.ts`           | IR 統計分析（analyzeFunc, analyzeModule, formatStats）                                                                 |
| `packages/core/src/wasm/__tests__/optimizer-report.test.ts`   | 最適化レポート（compileWithReport, formatReport）                                                                      |
| `packages/core/src/stdlib/__tests__/mem.test.ts`              | memcpy/memset/memcmp                                                                                                   |
| `packages/core/src/stdlib/__tests__/math.test.ts`             | pow/clamp/abs/lerp                                                                                                     |
| `packages/core/src/stdlib/__tests__/sort.test.ts`             | sortI32/sortWith                                                                                                       |
| `packages/showcase/examples/__tests__/layer3.test.ts`    | Layer 3 使用例（fibonacci, gcd）                                                                                       |
| `packages/showcase/examples/__tests__/layer2.test.ts`    | Layer 2 使用例（kadane, binary-search, array-stats）                                                                   |
| `packages/showcase/examples/__tests__/advanced.test.ts`  | 高度機能使用例（struct, stdlib sort, bench）                                                                           |
| `packages/showcase/examples/__tests__/realworld.test.ts` | Realworld 使用例（grayscale, CRC32, Game of Life, particles）                                                          |

---

## E2E テスト（Playwright）

**設定:** `playwright.config.ts`

```bash
pnpm run test:e2e   # Playwright E2E テスト
```

### 構成

- `testDir: "./packages/showcase/e2e"`
- Vite dev server を自動起動（`http://localhost:5173`）
- CI では `reuseExistingServer: false`

### テスト内容

`packages/showcase/e2e/app.test.ts`:

1. 全問題が PASS する — `.status-pass` 要素が表示されるまで待機
2. Realworld Demos セクションが表示される — `.demo-card` が 4 つ、各タイトルを検証
3. CRC32 デモがリアルタイム計算する — 入力値変更で結果が更新されることを検証

---

## 新しい問題の追加手順

### 1. 問題ファイルを作成

`packages/showcase/examples/problems/new-problem.ts`:

```typescript
import { compile, local, Type, Mod, Mem, Ctrl } from "wasmize/dsl/compiler";

export function problem16_xxx() {
  return compile<{ func_name: (n: number) => number }>(function* () {
    // メモリが必要なら:
    // yield* Mod.memory(2);
    // const arr = Mem.i32Array();

    yield* Mod.exportFunc("func_name", { n: Type.i32 }, function* (n) {
      // ローカル変数（初期値付き）:
      // const tmp = yield* local(Type.i32, 0);

      // アルゴリズムを記述
      return n; // 暗黙の return coercion (WasmRef → local_get)
    });
  });
}
```

### 2. index.ts に追加

`packages/showcase/examples/problems/index.ts`:

```typescript
export { problem16_xxx } from "./new-problem";
```

### 3. テストを追加

`packages/showcase/examples/problems/__tests__/new-problem.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { problem16_xxx } from "../new-problem";
import { instantiate } from "wasmize/runtime/instantiate";

describe("New Problem", () => {
  test.each([
    { input: 1, expected: 1 },
    // テストケースを追加...
  ])("func($input) = $expected", async ({ input, expected }) => {
    const {
      exports: { func_name },
    } = await instantiate(problem16_xxx());

    expect(func_name(input)).toBe(expected);
  });
});
```

### 4. runner.ts に追加

`packages/showcase/app/runner.ts` の `runTests()` に新しい問題のセクションを追加します。

### 5. テスト実行

```bash
pnpm run test       # ユニットテストで動作確認
pnpm run typecheck  # 型チェック
pnpm run test:e2e   # E2E（.status-pass 数の更新が必要な場合あり）
```
