# wasmize

TypeScript で記述した DSL から WebAssembly バイナリを直接生成する Proof of Concept。
ランタイムや外部ツールチェイン（wasm-pack, Emscripten 等）を一切使わず、`IR → Codegen → Module Builder → LEB128 Encoder` の全レイヤーを純 TypeScript で実装しています。

## Architecture

```
ProblemDesc          compileProblem()         buildModule()
 (DSL定義)     ──→   DSLContext + IR    ──→   Wasm Binary
                          │                       │
                     emitIR()              WasmEncoder
                   (IR → opcodes)          (LEB128)
```

1. **DSL 層** — Generator ベース DSL + namespace API（`Mod`, `Op`, `Mem`, `Ctrl`, `Loc`）でアルゴリズムを宣言
2. **IR 層** — 20 種の `IRNode` discriminated union + `IR.*` ビルダー API
3. **Codegen** — IR ノードを Wasm opcode に変換（`emitIR()`）
4. **Module Builder** — Type / Import / Function / Memory / Export / Code セクションを構築
5. **Encoder** — LEB128 エンコーディングで Wasm バイナリを出力

詳細: [docs/architecture.md](docs/architecture.md)

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173 で全問題を実行
npm run test       # vitest ユニットテスト
npm run test:e2e   # Playwright E2E テスト
npm run typecheck  # 型チェック
```

## Problems

| # | 名前 | アルゴリズム | 特徴 |
|---|------|-------------|------|
| 1 | Tower of Hanoi | 再帰 | import による effect callback |
| 2 | Fibonacci DP | ボトムアップ DP | 線形メモリテーブル |
| 3 | Kadane's Algorithm | 最大部分配列和 | メモリ上の配列走査 (BASE=1024) |
| 4 | Coin Change | DP（最小コイン数） | 2 領域メモリ (dp + coins) |
| 5 | Binary Search | 二分探索 | ソート済み配列の線形メモリ探索 |

詳細: [docs/problems.md](docs/problems.md)

## Directory Structure

```
wasmize/
├── src/
│   ├── dsl/                    # Generator ベース DSL コンパイラ
│   │   ├── types.ts            #   型定義（WasmRef, WasmVal, FuncRef 等）
│   │   ├── primitives.ts       #   DSL プリミティブ + Namespace (Mod, Op, Mem, Ctrl, Loc)
│   │   ├── interpreter.ts      #   compile() — 3 フェーズ Module interpreter
│   │   └── compiler.ts         #   Re-export エントリポイント
│   ├── wasm/                   # Wasm 生成レイヤー
│   │   ├── ir.ts               #   IRNode 型定義 + IR.* ビルダー
│   │   ├── codegen.ts          #   emitIR()（IR → Wasm opcode）
│   │   ├── module.ts           #   buildModule()（バイナリセクション構築）
│   │   ├── encoder.ts          #   WasmEncoder（LEB128）
│   │   └── opcodes.ts          #   OP / TYPE 定数 + WasmValType
│   ├── problems/               # 5 つのアルゴリズム実装
│   │   ├── hanoi.ts
│   │   ├── fibonacci.ts
│   │   ├── kadane.ts
│   │   ├── coin-change.ts
│   │   ├── binary-search.ts
│   │   ├── index.ts            #   re-export
│   │   └── __tests__/          #   vitest テスト
│   ├── ui/                     # ブラウザ UI
│   │   ├── renderer.ts
│   │   └── styles.css
│   ├── runner.ts               # 全問題の実行・検証ロジック
│   └── main.ts                 # エントリーポイント
├── e2e/
│   └── app.test.ts             # Playwright E2E テスト
├── index.html
├── vite.config.ts
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

## Documentation

- [Architecture](docs/architecture.md) — コンパイルパイプラインの全ステージ詳細
- [Problems](docs/problems.md) — 5 問題のカタログ（シグネチャ・メモリレイアウト・テストケース）
- [Testing](docs/testing.md) — テスト戦略と新規問題の追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分けと開発フロー
