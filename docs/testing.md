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

describe("Problem Name", () => {
  test.each([
    // テストケースの配列
  ])("description", async (input) => {
    // 1. Wasm バイナリ生成
    const wasm = problemN_xxx();

    // 2. インスタンス化（import が必要なら第2引数で渡す）
    const { instance } = (await WebAssembly.instantiate(wasm, imports?)) as any;

    // 3. メモリ操作（必要な場合）
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    // mem に入力データを書き込み...

    // 4. 実行 & アサーション
    const fn = instance.exports.func_name as (...args: number[]) => number;
    expect(fn(args)).toBe(expected);
  });
});
```

### メモリを使う問題のテスト

Kadane / Coin Change / Binary Search はメモリ上の配列に入力データを書き込む必要があります。

```typescript
// Kadane: BASE = 1024 bytes → Int32Array index = 1024/4 = 256
const base = 1024 / 4;
arr.forEach((v, i) => { mem[base + i] = v; });

// Coin Change: COIN_BASE = 2048 bytes → Int32Array index = 2048/4 = 512
const COIN_BASE = 2048 / 4;
coins.forEach((c, i) => { mem[COIN_BASE + i] = c; });

// Binary Search: 先頭から
arr.forEach((v, i) => { mem[i] = v; });
```

### import 付き問題のテスト

Hanoi は `env.effect_move` を import するため、インスタンス化時にコールバックを渡します。

```typescript
const moves: string[] = [];
const { instance } = (await WebAssembly.instantiate(wasm, {
  env: {
    effect_move: (from: number, to: number) => {
      moves.push(`${from}→${to}`);
    },
  },
})) as any;
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
import {
  compile, func, export_, param, local,
  i32, get, add, // ... 必要なプリミティブ
} from "../dsl/compiler";

export function problem6_xxx(): Uint8Array {
  return compile(function* () {
    // import が必要なら:
    // const imported = yield* import_("env", "fn", ["i32"], ["i32"]);

    // メモリが必要なら:
    // yield* memory(2);

    const f = yield* func(function* () {
      const n = yield* param("i32");
      // ローカル変数:
      // const tmp = yield* local("i32");

      // アルゴリズムを記述
      return yield* get(n);
    });

    yield* export_("func_name", f);
  });
}
```

### 2. index.ts に追加

`src/problems/index.ts`:

```typescript
export { problem6_xxx } from "./new-problem";
```

### 3. テストを追加

`src/problems/__tests__/new-problem.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { problem6_xxx } from "../new-problem";

describe("New Problem", () => {
  test.each([
    { input: 1, expected: 1 },
    // テストケースを追加...
  ])("func($input) = $expected", async ({ input, expected }) => {
    const wasm = problem6_xxx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const fn = instance.exports.func_name as (n: number) => number;

    expect(fn(input)).toBe(expected);
  });
});
```

### 4. runner.ts に追加

`src/runner.ts` の `runTests()` に新しい問題のセクションを追加します。

### 5. テスト実行

```bash
npm run test       # ユニットテストで動作確認
npm run typecheck  # 型チェック
npm run test:e2e   # E2E（.status-pass が 6 個になるよう e2e/app.test.ts の更新も必要）
```
