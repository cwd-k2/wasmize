import { compile, locals, Type, Mod, Ctrl } from "@/dsl/compiler";
import { Struct, BumpAllocator } from "@/dsl/primitives";
import { instantiate } from "@/runtime/instantiate";

/**
 * Struct 型で 2D 点群の Manhattan 距離を計算。
 *
 * Struct() はフィールドオフセット・アラインメントをコンパイル時に計算。
 * StructArray + .at(i) で OOP スタイルのフィールドアクセス。
 *
 * Layer 1 との比較:
 *   Layer 1: Mem.load(base + i * 8 + 4)  ← マジックナンバー
 *   Struct:  points.at(i).y              ← フィールド名でアクセス
 */
const Point = Struct({ x: "i32", y: "i32" });

export async function structPoints() {
  const alloc = new BumpAllocator();
  const points = Point.array(alloc, 100);

  const binary = compile<{ manhattanPath: (n: number) => number }>(function* () {
    yield* Mod.memory(Math.max(alloc.requiredPages, 1));

    // 連続する点間の Manhattan 距離の合計を計算
    yield* Mod.exportFunc("manhattanPath", { n: Type.i32 }, function* (n) {
      const [i, total, dx, dy] = yield* locals([Type.i32, 1], [Type.i32, 0], Type.i32, Type.i32);

      yield* Ctrl.range(i, 1, n, function* () {
        const curr = points.at(i);
        // Note: points.at(i.sub(1)) cannot be cached because ChainableExpr
        // indices are single-use generators. Use .get() for computed indices.
        yield* dx.set(curr.x.sub(points.get(i.sub(1), "x")));
        yield* dy.set(curr.y.sub(points.get(i.sub(1), "y")));

        // abs via: (v ^ (v >> 31)) - (v >> 31)
        yield* dx.set(dx.xor(dx.shr(31)).sub(dx.shr(31)));
        yield* dy.set(dy.xor(dy.shr(31)).sub(dy.shr(31)));

        yield* total.incrBy(dx.add(dy));
      });

      return total;
    });
  });

  const { exports, mem } = await instantiate(binary);

  return {
    setPoint(i: number, x: number, y: number) {
      // Point.size = 8 (2 × i32), so element i starts at byte i * 8
      const base = (i * Point.size) / 4; // word offset
      mem![base] = x;
      mem![base + 1] = y;
    },
    manhattanPath: exports.manhattanPath,
  };
}
