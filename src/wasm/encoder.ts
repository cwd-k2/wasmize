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
    this.i32(v); // works for small values
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
