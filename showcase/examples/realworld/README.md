# realworld/ — 実用ユースケース

実際のアプリケーションに近い Wasm 実装のデモ集。
ブラウザ UI でビジュアル確認可能。

## デモ一覧

| ファイル                    | 内容                                              |
| --------------------------- | ------------------------------------------------- |
| `grayscale.ts`              | RGBA → グレースケール変換（チャンネルループ展開） |
| `sepia.ts`                  | セピア調フィルタ（重み付きチャンネル合成）        |
| `convolution.ts`            | 3×3 カーネル畳み込み（エッジ検出等）              |
| `histogram.ts`              | RGBA ヒストグラム計算（256 ビン）                 |
| `histogram-equalization.ts` | ヒストグラム均等化（コントラスト自動調整）        |
| `erode-dilate.ts`           | モルフォロジー演算（膨張・収縮）                  |
| `game-of-life.ts`           | Conway's Game of Life（byteGrid, 8 近傍）         |
| `particles.ts`              | 粒子シミュレーション（Struct, 壁反射）            |
| `crc32.ts`                  | CRC-32 チェックサム（テーブル駆動）               |
| `maze-bfs.ts`               | 迷路 BFS 探索（Queue ヘルパ）                     |

## 共通パターン

- RGBA 画像処理: `RGBA.at(offset)` で pixel 読み書き
- チャンネル展開: `for (const ch of ["r","g","b"] as const)` でコンパイル時 3 回展開
- 近傍走査: `Meta.neighbors4` / `Meta.neighbors8` で方向オフセット
