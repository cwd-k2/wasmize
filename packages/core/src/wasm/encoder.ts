/**
 * Low-level Wasm binary encoder.
 *
 * Provides LEB128 (unsigned/signed), IEEE 754 (f32/f64) encoding,
 * and Wasm-specific helpers for vectors and sections.
 *
 * @module
 */

/**
 * Accumulates Wasm bytecode into a `number[]` buffer.
 *
 * Encoding methods:
 * - `byte(b)` — raw byte
 * - `u32(v)` / `i32(v)` / `i64(v)` — LEB128 integers
 * - `f32(v)` / `f64(v)` — IEEE 754 floats
 * - `vec(items, fn)` — length-prefixed vector
 * - `section(id, fn)` — Wasm section with auto-computed length
 * - `raw(arr)` — raw byte array
 */
export class WasmEncoder {
  bytes: number[] = [];

  byte(b: number): void {
    this.bytes.push(b & 0xff);
  }

  u32(v: number): void {
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v) b |= 0x80;
      this.bytes.push(b);
    } while (v);
  }

  i32(v: number): void {
    let more = true;
    while (more) {
      let b = v & 0x7f;
      v >>= 7;
      if ((v === 0 && !(b & 0x40)) || (v === -1 && b & 0x40)) more = false;
      else b |= 0x80;
      this.bytes.push(b);
    }
  }

  i64(v: number): void {
    // Use BigInt for proper 64-bit signed LEB128 encoding.
    // JS Number loses precision above 2^53, so callers should use
    // small i64 constants and construct large values via Wasm ops.
    let val = BigInt(v);
    let more = true;
    while (more) {
      const b = Number(val & 0x7fn);
      val >>= 7n;
      if ((val === 0n && !(b & 0x40)) || (val === -1n && (b & 0x40))) {
        more = false;
        this.bytes.push(b);
      } else {
        this.bytes.push(b | 0x80);
      }
    }
  }

  f32(v: number): void {
    const buf = new ArrayBuffer(4);
    new Float32Array(buf)[0] = v;
    new Uint8Array(buf).forEach((b) => this.bytes.push(b));
  }

  f64(v: number): void {
    const buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = v;
    new Uint8Array(buf).forEach((b) => this.bytes.push(b));
  }

  vec<T>(items: T[], encodeFn: (item: T) => void): void {
    this.u32(items.length);
    items.forEach((i) => encodeFn(i));
  }

  section(id: number, contentFn: (enc: WasmEncoder) => void): void {
    this.byte(id);
    const enc = new WasmEncoder();
    contentFn(enc);
    this.u32(enc.bytes.length);
    this.bytes.push(...enc.bytes);
  }

  raw(arr: number[]): void {
    this.bytes.push(...arr);
  }

  toBuffer(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
