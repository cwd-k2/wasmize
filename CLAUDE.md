# wasmize

Generator ベースの DSL で定義したアルゴリズムを Wasm バイナリにコンパイルする PoC。

## Commands

| Script               | Command                                   |
| -------------------- | ----------------------------------------- |
| `pnpm run dev`       | Vite dev server（showcase）               |
| `pnpm run build`     | 全パッケージビルド                        |
| `pnpm run test`      | `vitest run`（ユニットテスト、workspace） |
| `pnpm run test:e2e`  | `playwright test`（E2E）                  |
| `pnpm run typecheck` | `tsc --noEmit`（全パッケージ）            |

## Directory Structure (pnpm monorepo)

```
packages/
  core/                   # wasmize（npm publish 対象）
    src/
      dsl/                # Generator ベース DSL → Wasm バイナリのコンパイラ
        compiler.ts       #   barrel（namespace, primitive, data structure re-exports）
        interpreter.ts    #   3-phase module interpreter（宣言収集→body解釈→最適化&出力）
        expr.ts           #   ChainableExpr, CallableFunc, resolve()
        declarations.ts   #   param, local, locals, Type
        namespaces.ts     #   Mod, Op, Mem, Ctrl, Loc, Tuple
        primitives.ts     #   i32, i64, f32, f64 定数ヘルパ
        struct.ts         #   Struct, FieldAccessor, StructArray
        string.ts         #   Str（UTF-8 文字列埋め込み・ランタイム操作）
        allocator.ts      #   BumpAllocator（コンパイル時メモリレイアウト）
        meta.ts           #   Meta namespace（コンパイル時マクロ）
        augment.ts        #   WasmRef prototype augmentation
        types.ts          #   WasmRef, FuncGen, WasmBinary 等の型定義
        intercept.ts      #   Generator intercept / compose / filter
        instrument.ts     #   命令プロファイル
        guard.ts          #   メモリ境界ガード
        diagnostics.ts    #   統合診断 API（V-xx バリデーション基盤）
        bounds.ts         #   境界チェック付き配列ヘルパ
        # データ構造（Generator ファクトリ）
        queue.ts, stack.ts, ringbuffer.ts, bitset.ts
        minheap.ts, maxheap.ts, hashmap.ts, hashset.ts
        deque.ts, union-find.ts, graph.ts
        sorted-array.ts, segment-tree.ts, lru-cache.ts
      wasm/               # IR 定義・Codegen・Module Builder・Encoder・Opcodes
        ir.ts             #   IRNode discriminated union
        codegen.ts        #   IR → Wasm バイナリ変換
        module.ts         #   ModuleBuilder（FuncDef, ModuleOptions）
        encoder.ts        #   LEB128 / セクションエンコーダ
        opcodes.ts        #   WasmValType, Wasm opcode 定数
        optimize.ts       #   プラグイン式オプティマイザ
        optimizer-passes.ts  # builtinPasses（9 パス）
        optimizer-report.ts  # compileWithReport / formatReport
        capabilities.ts   #   WasmFeature, FeatureSet, scanFeatures
        ir-stats.ts       #   analyzeFunc / analyzeModule / formatStats
        wat.ts            #   WAT テキスト出力（デバッグ用）
        call-graph.ts     #   コールグラフ解析・再帰検出・未使用関数検出
        dead-code.ts      #   デッドコード検出
        source-map.ts     #   Source Map v3 生成（VLQ エンコーディング）
      stdlib/             # 再利用可能 Wasm 関数ライブラリ（16 モジュール）
        index.ts          #   StdlibFunc interface + barrel exports
        math.ts           #   pow, clamp, abs, lerp, gcd, lcm, gcdI64
        sort.ts           #   sortI32, sortWith, mergeSort
        mem.ts            #   memcpy, memset, memcmp
        bits.ts           #   isPowerOf2, log2Floor, nextPowerOf2Func, bswap32
        search.ts         #   binarySearch, lowerBound, upperBound
        prng.ts           #   usePrng（xorshift32 PRNG ハンドル）
        trig.ts           #   sin, cos, tan, atan2
        math-f64.ts       #   log, log2, exp, pow_f64
        string-algo.ts    #   kmpBuildFailure, kmpSearch（KMP 文字列検索）
        matrix.ts         #   matTranspose, matMulF64, matScale
        color.ts          #   rgbToHsl, hslToRgb
        fixed.ts          #   固定小数点演算（fromInt, fromF64, toF64, add/sub/mul/div）
        modular.ts        #   modpow, modinv（モジュラ演算）
        sort-int.ts       #   countingSort, radixSort
        graph-algo.ts     #   BFS, DFS, Dijkstra
      runtime/            # ホスト統合ユーティリティ（Wasm 実行時）
        instantiate.ts    #   instantiate, instantiateFromUrl, instantiateFromResponse
        marshal.ts        #   writeI32Array, readI32Array, writeF64Array, readF64Array, writeString, readString, roundtrip
        worker-pool.ts    #   WorkerPool（型安全, dedup オプション）
        fuzz.ts           #   fuzz(), Gen（プロパティベーステスト）
        assertions.ts     #   assertNoTraps, assertTraps
        mock.ts           #   mockImports（import section パース + 自動スタブ生成）
        async-bridge.ts   #   AsyncBridge（async JS ↔ sync Wasm effect protocol）
        bench-history.ts  #   saveBenchmark, loadBenchmark, compareBenchmarks
        canvas.ts         #   writeImageData, readImageData, syncCanvas
        color.ts          #   rgbToHex, hexToRgb, lerpColor
        debug-utils.ts    #   dumpMemory, snapshotMemory, diffMemory, formatDiff
        graph-marshal.ts  #   buildCSR, buildWeightedCSR, buildUndirectedCSR, writeCSR
      __tests__/          # ライブラリテスト
      index.ts, debug.ts, inline.ts, declarative.ts, bench.ts, optimizer.ts, worker.ts
  showcase/               # @wasmize/showcase（private、core に依存）
    app/                  # ブラウザアプリ
    ui/                   # ブラウザ UI
    examples/             # 実例・アルゴリズム実装
      problems/           #   18 アルゴリズム問題
      realworld/          #   画像処理・シミュレーション（10 例）
      advanced/           #   上級機能デモ（intercept, optimizer, struct 等）
      layer2/, layer3/    #   段階的サンプル
    game/                 # Space Shooter（Wasm DSL）
    bench/                # パフォーマンスベンチマーク
    e2e/                  # Playwright E2E テスト
    index.html, game.html
docs/                     # 技術ドキュメント
```

## Conventions

- **strict TypeScript** + ESM only（`"type": "module"`）
- `as any` は `packages/core/src/runtime/instantiate.ts` の `instantiate()` 内に封じ込め。テスト・ベンチ・runner では `WasmBinary<T>` による型推論でキャスト不要
- IR ノードは discriminated union（`op` フィールドで判別）
- Generator DSL: `yield*` で合成、`compile()` でバイナリ出力
- プリミティブは Generator を直接返す（IIFE パターン）、body は `function*() {}` factory
- `Expr = WasmVal | FuncGen<WasmVal>` — `resolve()` で統一的に解決
- Namespace は PascalCase（`Mod`, `Op`, `Mem`, `Ctrl`, `Loc`）— ローカル変数との視覚的区別
- 型リテラルは `Type.i32` / `Type.i64` / `Type.f64` 定数を使用（typo 防止 + 補完支援）
- `compile<T>()` の型パラメータで export 関数のシグネチャを宣言。戻り値 `WasmBinary<T>` はファントム型
- `instantiate()` ヘルパでインスタンス化。`const { exports: { fn }, mem } = await instantiate(problem())` パターン
- ループ糖衣: `Ctrl.for(var, start, cond, step, body)`, `Ctrl.while(cond, body)`, `Ctrl.when(cond, body)`, `Ctrl.range(i, n, body)` / `Ctrl.range(i, start, end, body)`
- Range ループ: `Ctrl.range(i, n, body)` は `Ctrl.for(i, 0, i.lt(n), i.add(1), body)` の糖衣。4 引数形式で開始値指定可
- elseif チェイン: `Ctrl.if(c1).then(b1).elseif(c2).then(b2).else(b3)` — フラットな else-if。IR は既存ネスト if/else と同一。戻り値ありの if-expression としても使用可
- 多方向分岐: `Ctrl.switch(expr).case(v, body).default(body)` — ビルダパターン、dense 時 br_table / sparse 時 if/else チェイン
- 値選択: `Op.select(cond, a, b)` は Wasm `select` 命令、`Op.max(a, b)` / `Op.min(a, b)` は select ベース
- 配列ヘルパ: `Mem.i32Array(base)` で `.mul(4)` を隠蔽、`.at(i)` で `FieldAccessor` 取得、`.swap(i, j, tmp)` で要素交換、`.fill(start, end, value)` で一括初期化。`base` はランタイム `ExprInput` も可
- 2D配列: `Mem.i32Array2D(base, cols)` で `.load(row, col)` / `.store(row, col, val)` / `.at(row, col)` で `FieldAccessor` 取得。`base` は `ExprInput`（ランタイム式可）
- バイトグリッド: `Mem.byteGrid(base, cols)` で `.load(row, col)` / `.store(row, col, val)` / `.at(row, col)`。`Mem.load8`/`Mem.store8` ベース、byte-per-cell グリッドに最適
- RGBA プリセット: `RGBA = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" })`。`RGBA.at(offset)` でピクセル読み書き。**注意:** `offset` は `WasmRef`（ローカル変数）を使うこと（`ChainableExpr` は single-use）
- Queue ヘルパ: `const q = yield* Queue(base)` で BFS キュー生成。`q.enqueue(v)`, `q.dequeue(dst)`, `q.notEmpty`（条件式）, `q.reset()` を提供。内部で `head`/`tail` ローカル変数を確保
- Stack ヘルパ: `const s = yield* Stack(base)` で LIFO スタック生成。`s.push(v)`, `s.pop(dst)`, `s.notEmpty`, `s.peek()`, `s.reset()` を提供。内部で `top` ローカル変数を確保
- RingBuffer ヘルパ: `const rb = yield* RingBuffer(base, capacity)` で固定容量循環バッファ生成。`rb.write(v)`, `rb.read(dst)`, `rb.isFull`, `rb.isEmpty`, `rb.reset()` を提供。capacity が 2 の冪なら `and` でラップ、それ以外は `rem_u`。内部で `head`/`tail`/`count` ローカル変数を確保
- BitSet ヘルパ: `const bs = BitSet(base)` でビット配列生成（Generator 不要の plain function）。`bs.set(idx)`, `bs.get(idx)`, `bs.clear(idx)`, `bs.clearAll(bitCount)` を提供。`clearAll` はコンパイル時展開
- MinHeap ヘルパ: `const heap = yield* MinHeap(base)` で (priority, value) ペアの min-heap 生成。`heap.insert(pri, val)`, `heap.extractMin(dstPri, dstVal)`, `heap.peekPriority()`, `heap.peekValue()`, `heap.notEmpty`, `heap.reset()`。interleaved メモリレイアウト `[pri0, val0, pri1, val1, ...]`
- MaxHeap ヘルパ: `const heap = yield* MaxHeap(base)` で max-heap 生成。MinHeap と同一 API（`insert`, `extractMax`, `peekPriority`, `peekValue`, `notEmpty`, `reset`）
- HashMap ヘルパ: `const map = yield* HashMap(base, capacity)` で open addressing + linear probing のハッシュマップ生成。**capacity は 2 の冪**（コンパイル時 assert）。`map.set(key, val)`, `map.get(key, dst)`, `map.has(key)`, `map.delete(key)`, `map.clear()`, `map.notEmpty`。3 並列配列（statuses, keys, values）
- HashSet ヘルパ: `const hs = yield* HashSet(base, capacity)` で open addressing hash set。**capacity は 2 の冪**。`hs.add(key)`, `hs.has(key)`, `hs.delete(key)`, `hs.clear()`, `hs.notEmpty`
- Deque ヘルパ: `const dq = yield* Deque(base, capacity)` で double-ended queue。`dq.pushFront(v)`, `dq.pushBack(v)`, `dq.popFront(dst)`, `dq.popBack(dst)`, `dq.notEmpty`, `dq.reset()`。circular buffer 実装
- UnionFind ヘルパ: `const uf = yield* UnionFind(base)` で disjoint set。`uf.init(n)`, `uf.find(x, dst)`, `uf.union(x, y)`, `uf.same(x, y)`。path compression + union by rank
- Graph ヘルパ: `const g = Graph(vertexBase, edgeBase)` で CSR 形式グラフ（Generator 不要）。`g.forEachNeighbor(v, callback)`, `g.degree(v)`, `g.edgeStart(v)`, `g.edgeEnd(v)`
- SortedArray ヘルパ: `const sa = yield* SortedArray(base)` でソート済み配列。`sa.insert(v)`, `sa.has(v)`, `sa.delete(v)`, `sa.at(i)`, `sa.size`
- SegmentTree ヘルパ: `const st = yield* SegmentTree(base, n)` で iterative bottom-up segment tree。`st.build(srcBase)`, `st.query(l, r)`, `st.update(i, val)`。range sum query 用
- LRUCache ヘルパ: `const cache = yield* LRUCache(base, capacity)` で LRU キャッシュ。**capacity は 2 の冪**。`cache.get(key, dst)` → found フラグ, `cache.put(key, val)`, `cache.clear()`
- 境界チェック糖衣: `x.inRange(lo, hi)` は `x.ge(lo).and(x.lt(hi))` の糖衣。`WasmRef` と `ChainableExpr` の両方で使用可。2D 境界チェックに `nx.inRange(0, w).and(ny.inRange(0, h))`
- N 次元グリッドループ: `yield* Ctrl.grid([h, w], (y, x) => [...])` — ループ変数を自動確保し `Ctrl.range` を再帰的にネスト。0D（即実行）、1D、2D、3D 対応
- Scope/defer: `Ctrl.scope(function* (scope) { scope.defer(cleanup); ... })` でスコープ付きリソース管理。defer は LIFO 順でクリーンアップ展開
- Struct snapshot: `const { r, g, b } = yield* RGBA.snapshot(offset, "r", "g", "b")` で指定フィールドをローカル変数にコピー。StructArray にも同様に `particles.snapshot(i, "x", "y")` が使用可
- StructArray forEach: `yield* particles.forEach(n, function* (p, i) { yield* p.x.incrBy(p.vx); })` で配列要素をイテレーション。ループ変数は内部で宣言
- 一括 export: `Mod.exportAll({ name: funcRef, ... })`
- i32 unsigned ops: `Op.div_u`, `Op.rem_u`, `Op.shr_u`, `Op.lt_u`, `Op.gt_u`, `Op.le_u`, `Op.ge_u`
- i64 演算: `Op.i64.add/sub/mul/div`, `Op.i64.eqz`
- f64 演算: `Op.f64.add/sub/mul/div`, `Op.f64.neg`, `Op.f64.abs`
- 型変換: `Op.wrap` (i64→i32), `Op.extend` (i32→i64), `Op.toF64` (i32→f64), `Op.truncI32` (f64→i32)
- 定数ヘルパ: トップレベル `i32(v)`, `i64(v)`, `f64(v)` で chainable 定数生成（`i32(1).shl(col)` 等）。`Mem.i32/i64/f64` のエイリアス
- 暗黙戻り値変換: 関数本体から `return count`（WasmRef → local_get）や `return 0`（number → i32.const）が直接可能。`FuncReturn = WasmVal | WasmRef | number | void`
- 破壊的更新: `x.incrBy(v)`, `x.decrBy(v)`, `x.mulBy(v)`, `x.divBy(v)`, `x.remBy(v)`, `x.andBy(v)`, `x.orBy(v)`, `x.xorBy(v)`, `x.shlBy(v)`, `x.shrBy(v)`（`WasmRef` は `x.set(x.op(v))` の糖衣、`FieldAccessor` は load-modify-store を 1 命令列に最適化）
- Struct フィールドアクセス: `points.at(i).x` は `FieldAccessor` を返す Proxy。`.set(v)`, `.incrBy(v)` 等の mutation メソッド + `ChainableExpr` として読み取り可。動的インデックスの `at()` は single-use（キャッシュ不可）
- Packed fields: `Struct({ r: "u8", g: "u8", b: "u8" })` — `u8`/`u16` は sub-word メモリ命令でアクセスし、Wasm スタック上は `i32`
- 単項演算: float `.neg()/.abs()/.sqrt()/.ceil()/.floor()/.trunc()/.nearest()`、int `.clz()/.ctz()/.popcnt()`、全型 `.eqz()`（`WasmRef` + `ChainableExpr` の両方で使用可）
- 型変換メソッド: `.toF64()`, `.toI32()`, `.toI64()`, `.toF32()` — source 型から自動ディスパッチ（`WasmRef` + `ChainableExpr`）
- クランプ: `expr.clamp(min, max)` — float は native `min`/`max` 命令、int は `select`+`cmp`（`ChainableExpr` のみ）
- typed メモリ: `Mem.loadI64/storeI64`, `Mem.loadF64/storeF64`
- メモリシステム: `Mem.size()`, `Mem.grow(pages)`
- トラップ: `Ctrl.unreachable()`
- `binop`/`cmp`/`eqz` の IR ノードは `type?: WasmValType` で i32/i64/f64 をディスパッチ（省略時 i32）
- `inferType(node, ctx)` が IR ノードから結果型を推定（関数戻り値型・if ブロック型に使用）
- 多態型システム: `WasmRef<T>` は `_valType` でランタイム型を保持し、`.add()` 等がディスパッチ。`ChainableExpr<T>` がチェイン全体で型を伝搬。`this: WasmRef<IntType>` で float への bitwise/rem を禁止。`CallableFunc<Params>` と `ModNamespace` オーバーロードでアリティ推論
- Generator Intercept: `intercept(gen, transform)` で `yield*` のインターセプト + 変換。`interceptIR(gen, transform)` は stmt の IRNode のみ変換。`withTrace(label, gen, collector)` で非破壊トレース収集。`interceptModule(gen, transform)` でモジュールレベル変換。全て `compiler.ts` から公開 export
- Intercept 合成: `composeIntercepts(gen, ...transforms)` で複数変換を左→右チェイン。`interceptFilter(gen, shouldDrop)` で stmt をドロップ（decl は安全のためスキップ不可）。`interceptWhen(gen, predicate, transform)` で条件付き変換
- Debug 統合: `traceBody(label, collector, body)` で関数 body をトレース付きラップ（`debug.ts` から export）
- 命令プロファイル: `createProfile()` + `withProfiling(gen, profile)` でコンパイル時命令カウント。zero-overhead（`instrument.ts`）
- メモリ境界ガード: `withBoundsCheck(gen, maxBytes)` で store/load に境界チェック挿入。OOB で `unreachable` トラップ。Production では外すだけ（`guard.ts`）
- BumpAllocator: `new BumpAllocator()` でコンパイル時メモリレイアウト管理。`alloc.alloc(size, align)` で byte offset 取得。zero-overhead（全アドレスが i32 定数）。overlap 検出付き
- Str ヘルパ: `Str.from(alloc, "hello")` でコンパイル時 UTF-8 埋め込み（data segment 経由）。`Str.len(ptr)`, `Str.eq(a, b)`, `Str.cmp(a, b)` でランタイム文字列操作
- 境界チェック付き配列: `boundsCheckedArray(alloc, count)` で BumpAllocator ベースの安全な配列。OOB アクセスで unreachable トラップ
- 統合診断 API: `compileWithDiagnostics(program, options)` で V-xx バリデーション結果を構造化収集。`DiagnosticCollector` + `Diagnostic` 型。エラーで即座に止めず全問題を報告
- プラグイン式オプティマイザ: `OptimizerPass` interface（`name` + `transform(node): IRNode`）。`builtinPasses` に 9 パス。`createOptimizer(passes)` で bottom-up 最適化関数を生成。`withoutPasses(names)` でパス除外。`compile()` に `optimizerConfig: { passes?, iterations? }` オプション
- Capability Tracking: `WasmFeature` 型（mvp, bulk-memory, multi-value 等 10 種）。`Features.MVP/Standard/All` プリセット。`scanFeatures(funcs)` で IR 走査・feature 検出（mutable-globals, multi-value, sign-extension, reference-types）。`compile()` に `target: FeatureSet` オプションで target validation。`describeFeature(f)` で human-readable 説明。`suggestTarget(funcs)` で最小プリセット推薦。`customFeatureSet(...features)` でカスタム FeatureSet 生成
- IR 統計: `analyzeFunc(body)` / `analyzeModule(funcs)` で IRStats 取得（totalNodes, nodesByOp, maxDepth, memoryLoads/Stores, branches, calls, localAccesses）。`formatStats(stats)` で人間可読出力
- 最適化レポート: `compileWithReport(program, options)` で最適化前後の IRStats 比較 + バイナリ出力。`formatReport(report)` でサマリー表示
- コールグラフ解析: `buildCallGraph(funcs)` で関数間呼び出しグラフ構築。`findRecursion(graph)` で再帰検出、`findUnusedFunctions(graph, exports)` で未使用関数検出
- デッドコード検出: `detectDeadCode(funcs)` で return/br/unreachable 後の到達不能コードを検出。`formatDeadCode(entries)` で人間可読レポート
- Source Map: `compileWithSourceMap(program)` で Source Map v3 生成。`SourceMapCollector` + `buildSourceMap()` で VLQ エンコーディング。Wasm byte offset → DSL ソース位置マッピング
- WorkerPool: `WorkerState` interface で型安全な状態管理（`(worker as any).__pending` を排除）。`dedup: true` オプションで同一引数の in-flight タスク重複排除

### stdlib（Wasm 関数ライブラリ）

`StdlibFunc` interface で定義。`Mod.use(stdlibFunc)` でモジュールに埋め込み、`CallableFunc` として呼び出し可能。

- **math**: `pow`, `clamp`, `abs`, `lerp`, `gcd`, `lcm`, `gcdI64`
- **sort**: `sortI32`（quicksort）, `sortWith`（比較関数カスタム）, `mergeSort`
- **sort-int**: `countingSort`, `radixSort`（整数特化）
- **mem**: `memcpy`, `memset`, `memcmp`
- **bits**: `isPowerOf2`, `log2Floor`, `nextPowerOf2Func`, `bswap32`
- **search**: `binarySearch`, `lowerBound`, `upperBound`
- **prng**: `usePrng`（xorshift32 PRNG、Generator ファクトリで seed 管理）
- **trig**: `sin`, `cos`, `tan`, `atan2`（Taylor 級数近似）
- **math-f64**: `log`, `log2`, `exp`, `pow_f64`（f64 数学関数）
- **string-algo**: `kmpBuildFailure`, `kmpSearch`（KMP 文字列検索）
- **matrix**: `matTranspose`, `matMulF64`, `matScale`
- **color**: `rgbToHsl`, `hslToRgb`
- **fixed**: 固定小数点演算（`fixedFromInt`, `fixedFromF64`, `fixedToF64`, `fixedAdd/Sub/Mul/Div`）
- **modular**: `modpow`, `modinv`（モジュラ演算）
- **graph-algo**: BFS, DFS, Dijkstra（Graph CSR 形式と併用）

### ランタイムユーティリティ

- **instantiate**: `instantiate(binary)`, `instantiateFromUrl(url)`, `instantiateFromResponse(res)` — Wasm インスタンス化
- **marshal**: `writeI32Array`, `readI32Array`, `writeF64Array`, `readF64Array`, `writeString`, `readString`, `roundtrip`
- **fuzz**: `fuzz(binary, generators, options)` — プロパティベーステスト。`Gen.i32()`, `Gen.i32Range(lo, hi)` 等で入力生成
- **assertions**: `assertNoTraps(fn)` / `assertTraps(fn)` — Wasm トラップ検証
- **mock**: `mockImports(binary, overrides?)` — import section パース + 自動スタブ生成
- **async-bridge**: `new AsyncBridge(binary)` — async JS ↔ sync Wasm effect protocol
- **bench-history**: `saveBenchmark(result)`, `loadBenchmark(name)`, `compareBenchmarks(a, b)` — ベンチマーク永続化・比較
- **canvas**: `writeImageData(mem, imageData)`, `readImageData(mem, imageData)`, `syncCanvas(mem, ctx)` — Canvas ピクセル同期
- **color** (runtime): `rgbToHex`, `hexToRgb`, `lerpColor` — JS 側カラーユーティリティ
- **debug-utils**: `dumpMemory`, `snapshotMemory`, `diffMemory`, `formatDiff` — メモリデバッグ
- **graph-marshal**: `buildCSR`, `buildWeightedCSR`, `buildUndirectedCSR`, `writeCSR` — グラフ CSR マーシャリング

### JS メタプログラミング

Generator DSL は JS ランタイム上で実行されるため、JS/TS はチューリング完全なプリプロセッサとして機能する。JS の制御構造やオブジェクト指向機能はコンパイル時に展開され、実行時の Wasm には現れない。

**コンパイル時展開パターン:**

- Config 配列 + `for...of`: 同一パターンの N 方向展開（flood-fill 4 方向、Game of Life 8 近傍）
- ファクトリ関数: 共通 body を関数化し、差分をコールバックで注入（array-stats の reduceFunc）
- 文字列キー軸抽象化: Struct フィールドを `p[fieldName]` で動的アクセス（particles 壁反射）
- チャンネルループ: `for (const ch of ["r", "g", "b"] as const)` で RGB 3 チャンネルを処理（grayscale, sepia）

**OOP-style コンパイル時ヘルパ（メモリ抽象の 3 層構造）:**

- **Layer 1 (Raw)**: `Mem.load/store` — 手動アドレス計算
- **Layer 2 (構造化)**: `Mem.byteGrid(base, cols)`, `Mem.i32Array2D(base, cols)` — ストライド計算隠蔽
- **Layer 3 (ドメイン特化)**: `RGBA.at(offset)` — ピクセル操作、`Queue(base)` — BFS キュー

**Generator ファクトリパターン:** `yield*` でローカル変数を内部に確保し、操作メソッドを持つオブジェクトを返す。`Queue` がこのパターンの代表例。カプセル化された状態（head/tail 等）は呼び出し側から不可視

**注意（single-use 制約）:** `FieldAccessor` / `ChainableExpr` は内部 Generator が single-use。キャッシュせず毎回 Proxy 経由で取得する。**特に `Struct.at(expr)` の `expr` にはローカル変数（`WasmRef`）を使うこと。** `ChainableExpr`（例: `i.mul(4)`）を直接渡すと 2 番目以降のフィールドアクセスで壊れる。詳細は [docs/metaprogramming.md](docs/metaprogramming.md)

#### Meta namespace（コンパイル時マクロヘルパ）

`Meta` namespace は `() => [...]` array body 内でも使えるコンパイル時展開ヘルパを提供。全て zero-overhead（生成 Wasm に痕跡なし）。

- `Meta.each(items, (item, i) => [...])`: 配列の各要素に対してステートメント展開。`for...of` の `() => [...]` body 互換版
- `Meta.times(n, (i) => [...])`: N 回展開
- `Meta.when(condition, () => [...])`: JS 条件が falsy なら命令を一切生成しない
- `Meta.sum(exprs)`: N 個の式を加算チェイン。`ChainableExpr` を返す
- `Meta.product(exprs)`: N 個の式を乗算チェイン
- `Meta.weightedSum([{weight, expr}, ...])`: 重み付き加算。weight=0 はスキップ、weight=1 は乗算省略

### Known TS Limitations (polymorphic type system)

1. **`& ExprInput[]` intersection** (`expr.ts` CallableFunc): mapped type `{ [K in keyof Params]: ExprInput }` は TS が配列と証明できないため rest parameter に使えない。`& ExprInput[]` で回避するが、Params が **invariant** になる副作用がある
2. **`as unknown as ModNamespace`** (`namespaces.ts`): 上記の invariance により、実装の `CallableFunc`（wide）がインターフェースの `CallableFunc<[]>` 等に代入不可。unsafe cast で橋渡し
3. **`recursive` の self はアリティ未チェック** (`namespaces.ts`): self に `CallableFunc<{mapped}>` を入れると circular inference + invariance で型推論が破綻するため、`CallableFunc`（引数数制約なし）で妥協

## Package Imports

pnpm workspace で 2 パッケージに分割。showcase からは package name で import。

```typescript
import { compile } from "wasmize/dsl/compiler";
import { instantiate } from "wasmize/runtime/instantiate";
```

## Docs

- [Architecture](docs/architecture.md) — コンパイルパイプライン詳細
- [Metaprogramming](docs/metaprogramming.md) — JS メタプログラミングパターン
- [Problems](docs/problems.md) — 問題カタログ
- [Testing](docs/testing.md) — テスト戦略・追加手順
- [Workflow](docs/workflow.md) — コマンドの使い分け・開発フロー
- [Roadmap](docs/roadmap.md) — DSL 改善・Spec Coverage 拡大方針
- [Gap Spec](docs/gap-spec.md) — 全ギャップ仕様書（56 項目: W/D/S/R/T/V カテゴリ）
- [Implementation Plan](docs/implementation-plan.md) — gap-spec 実装バッチ計画
