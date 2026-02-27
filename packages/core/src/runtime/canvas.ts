/**
 * Canvas pixel sync helpers for transferring RGBA pixel data
 * between Wasm linear memory and HTML Canvas ImageData.
 *
 * Memory layout: RGBA packed, 4 bytes per pixel, row-major order.
 *
 * @module
 */

/**
 * Writes ImageData pixel bytes into Wasm memory at the given offset.
 *
 * @param bytes - Wasm memory as Uint8Array
 * @param offset - Byte offset in Wasm memory where pixel data starts
 * @param imageData - Source ImageData (from canvas `getImageData`)
 */
export function writeImageData(
  bytes: Uint8Array,
  offset: number,
  imageData: { data: Uint8ClampedArray; width: number; height: number },
): void {
  bytes.set(imageData.data, offset);
}

/**
 * Reads RGBA pixel data from Wasm memory and returns a new ImageData.
 *
 * In non-browser environments (e.g., tests), returns a plain object
 * with `data`, `width`, and `height` properties.
 *
 * @param bytes - Wasm memory as Uint8Array
 * @param offset - Byte offset in Wasm memory where pixel data starts
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns ImageData-compatible object with the pixel data
 */
export function readImageData(
  bytes: Uint8Array,
  offset: number,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const length = width * height * 4;
  const data = new Uint8ClampedArray(length);
  data.set(bytes.subarray(offset, offset + length));
  return { data, width, height };
}

/**
 * Batch reads pixel data from Wasm memory and draws it to a canvas context.
 *
 * @param ctx - Canvas 2D rendering context
 * @param bytes - Wasm memory as Uint8Array
 * @param offset - Byte offset in Wasm memory where pixel data starts
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 */
export function syncCanvas(
  ctx: { putImageData: (imageData: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number) => void },
  bytes: Uint8Array,
  offset: number,
  width: number,
  height: number,
): void {
  const imageData = readImageData(bytes, offset, width, height);
  ctx.putImageData(imageData, 0, 0);
}
