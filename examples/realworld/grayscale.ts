import { compile, local, Type, Mod, Mem, Ctrl, Op } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";

// RGBA pixel processing: grayscale conversion + brightness adjustment
// Memory layout: offset 0 に RGBA ピクセルデータ (4 bytes/pixel)
// 1 page = 64KB = 16384 pixels

type Exports = {
  grayscale: (len: number) => void;
  brightness: (len: number, delta: number) => void;
};

function grayscaleWasm() {
  return compile<Exports>(function* () {
    yield* Mod.memory(1);

    // grayscale: ITU-R BT.601 整数近似 gray = (77*R + 150*G + 29*B) >> 8
    yield* Mod.exportFunc(
      "grayscale",
      { len: Type.i32 },
      function* (len) {
        const i = yield* local(Type.i32, 0);
        const offset = yield* local(Type.i32);
        const gray = yield* local(Type.i32);

        yield* Ctrl.while(i.lt(len), function* () {
          yield* offset.set(i.mul(4));

          // gray = (77*R + 150*G + 29*B) >> 8
          yield* gray.set(
            Mem.load8(offset)
              .mul(77)
              .add(Mem.load8(offset.add(1)).mul(150))
              .add(Mem.load8(offset.add(2)).mul(29))
              .shr(8),
          );

          yield* Mem.store8(offset, gray);
          yield* Mem.store8(offset.add(1), gray);
          yield* Mem.store8(offset.add(2), gray);
          // alpha (offset+3) は変更しない

          yield* i.incrBy(1);
        });
      },
    );

    // brightness: 各 RGB チャンネル += delta, clamp(0, 255) via Op.max/Op.min
    yield* Mod.exportFunc(
      "brightness",
      { len: Type.i32, delta: Type.i32 },
      function* (len, delta) {
        const i = yield* local(Type.i32, 0);
        const offset = yield* local(Type.i32);
        const ch = yield* local(Type.i32);

        yield* Ctrl.while(i.lt(len), function* () {
          yield* offset.set(i.mul(4));

          // R
          yield* ch.set(Op.min(Op.max(Mem.load8(offset).add(delta), 0), 255));
          yield* Mem.store8(offset, ch);

          // G
          yield* ch.set(
            Op.min(Op.max(Mem.load8(offset.add(1)).add(delta), 0), 255),
          );
          yield* Mem.store8(offset.add(1), ch);

          // B
          yield* ch.set(
            Op.min(Op.max(Mem.load8(offset.add(2)).add(delta), 0), 255),
          );
          yield* Mem.store8(offset.add(2), ch);

          yield* i.incrBy(1);
        });
      },
    );
  });
}

export async function grayscale() {
  const binary = grayscaleWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    grayscale: exports.grayscale,
    brightness: exports.brightness,
    setPixels(data: Uint8Array) {
      bytes!.set(data);
    },
    getPixels(n: number): Uint8Array {
      return bytes!.slice(0, n * 4);
    },
    binary,
  };
}
