# Testing

## ユニットテスト（vitest）

**設定:** `vite.config.ts` — `test.include: ["src/**/__tests__/**/*.test.ts"]`

```bash
npm run test       # 全テスト実行（vitest run）
```

### テストパターン

各問題のテストは `src/problems/__tests__/` に配置され、共通のパターンに従います:

```typescript
import { describe, test, expect } from "vitest";
import { problemN_xxx } from "../xxx";
import { instantiate } from "../../test-helpers";

describe("Problem Name", () => {
  test.each([
    // テストケースの配列
  ])("description", async (input) => {
    // 1. コンパイル + インスタンス化（型は compile<T>() から自動推論）
    const { exports: { func_name }, mem } = await instantiate(problemN_xxx());

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
arr.forEach((v, i) => { mem![base + i] = v; });

// Coin Change: COIN_BASE = 2048 bytes → Int32Array index = 2048/4 = 512
const COIN_BASE = 2048 / 4;
coins.forEach((c, i) => { mem![COIN_BASE + i] = c; });

// Binary Search: 先頭から
arr.forEach((v, i) => { mem![i] = v; });
```

### import 付き問題のテスト

Hanoi は `env.effect_move` を import するため、インスタンス化時にコールバックを渡します。

```typescript
const moves: string[] = [];
const { exports: { hanoi } } = await instantiate(problem1_hanoi(), {
  env: {
    effect_move: (from: number, to: number) => {
      moves.push(`${from}→${to}`);
    },
  },
});
```

---

## E2E テスト（Playwright）

**設定:** `playwright.config.ts`

```bash
npm run test:e2e   # Playwright E2E テスト
```

### 構成

- `testDir: "./e2e"`
- Vite dev server を自動起動（`http://localhost:5173`）
- CI では `reuseExistingServer: false`

### テスト内容

`e2e/app.test.ts`:
1. `/` にアクセス
2. `.status-pass` 要素が 5 つ表示されるまで待機（timeout: 10s）
3. `.summary-title` に "All Problems Passed" が含まれることを検証

---

## 新しい問題の追加手順

### 1. 問題ファイルを作成

`src/problems/new-problem.ts`:

```typescript
import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem16_xxx() {
  return compile<{ func_name: (n: number) => number }>(function* () {
    // メモリが必要なら:
    // yield* Mod.memory(2);
    // const arr = Mem.i32Array();

    const f = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      // ローカル変数（初期値付き）:
      // const tmp = yield* local(Type.i32, 0);

      // アルゴリズムを記述
      return yield* Loc.get(n);
    });

    yield* Mod.export("func_name", f);
  });
}
```

### 2. index.ts に追加

`src/problems/index.ts`:

```typescript
export { problem16_xxx } from "./new-problem";
```

### 3. テストを追加

`src/problems/__tests__/new-problem.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { problem16_xxx } from "../new-problem";
import { instantiate } from "../../test-helpers";

describe("New Problem", () => {
  test.each([
    { input: 1, expected: 1 },
    // テストケースを追加...
  ])("func($input) = $expected", async ({ input, expected }) => {
    const { exports: { func_name } } = await instantiate(problem16_xxx());

    expect(func_name(input)).toBe(expected);
  });
});
```

### 4. runner.ts に追加

`src/runner.ts` の `runTests()` に新しい問題のセクションを追加します。

### 5. テスト実行

```bash
npm run test       # ユニットテストで動作確認
npm run typecheck  # 型チェック
npm run test:e2e   # E2E（.status-pass 数の更新が必要な場合あり）
```
