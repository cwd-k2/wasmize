/**
 * Pure TypeScript color utility functions.
 *
 * These run on the host (JS) side, complementing the Wasm-side
 * color conversion functions in `stdlib/color.ts`.
 *
 * @module
 */

/**
 * Converts RGB (0-255 per channel) to a hex color string.
 *
 * @param r - Red channel (0-255)
 * @param g - Green channel (0-255)
 * @param b - Blue channel (0-255)
 * @returns Hex string in `#RRGGBB` format
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts a hex color string to RGB components.
 *
 * @param hex - Hex string (`#RRGGBB` or `#RGB`)
 * @returns Object with r, g, b values (0-255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  let h = hex.startsWith("#") ? hex.slice(1) : hex;

  // Handle shorthand (#RGB -> #RRGGBB)
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }

  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/**
 * Linearly interpolates between two RGB colors.
 *
 * @param c1 - Start color
 * @param c2 - End color
 * @param t - Interpolation factor (0 = c1, 1 = c2)
 * @returns Interpolated color
 */
export function lerpColor(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return {
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  };
}
