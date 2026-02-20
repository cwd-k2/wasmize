import { local, Type, Mod, Mem, Ctrl, Op } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/runtime/instantiate";

// CRC32 checksum using lookup table embedded via Mod.data()
// Memory layout: offset 0-1023 = CRC32 table (256×4B), offset 1024+ = data

const TABLE_OFFSET = 0;
const DATA_OFFSET = 1024;

type Exports = {
  crc32: (dataOffset: number, len: number) => number;
};

// Generate standard CRC32 lookup table (IEEE 802.3 polynomial 0xEDB88320)
function generateCRC32Table(): Uint8Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc;
  }
  return new Uint8Array(table.buffer);
}

function crc32Wasm() {
  const tableBytes = generateCRC32Table();

  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(1);
    yield* Mod.data(TABLE_OFFSET, tableBytes);

    yield* Mod.exportFunc(
      "crc32",
      { dataOffset: Type.i32, len: Type.i32 },
      function* (dataOffset, len) {
        const crc = yield* local(Type.i32);
        const i = yield* local(Type.i32, 0);
        const idx = yield* local(Type.i32);

        // crc = 0xFFFFFFFF = -1 in i32
        yield* crc.set(-1);

        yield* Ctrl.while(i.lt(len), function* () {
          // idx = (crc ^ byte) & 0xFF
          yield* idx.set(crc.xor(Mem.load8(dataOffset.add(i))).and(0xff));

          // crc = table[idx] ^ (crc >>> 8)
          yield* crc.set(Mem.load(idx.mul(4).add(TABLE_OFFSET)).xor(Op.shr_u(crc, 8)));

          yield* i.incrBy(1);
        });

        // return crc ^ 0xFFFFFFFF = crc ^ -1
        return yield* crc.xor(-1);
      },
    );
  });
}

export async function crc32() {
  const binary = crc32Wasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    // Convenience: write data + compute CRC32, return as unsigned
    compute(data: Uint8Array): number {
      bytes!.set(data, DATA_OFFSET);
      return exports.crc32(DATA_OFFSET, data.length) >>> 0;
    },
    crc32: exports.crc32,
    bytes: bytes!,
    binary,
    DATA_OFFSET,
  };
}
