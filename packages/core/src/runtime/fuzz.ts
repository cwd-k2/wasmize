/**
 * Fuzzing framework for Wasm DSL programs.
 *
 * Provides random input generators and a test runner that catches
 * Wasm traps and runtime errors, with simple input shrinking.
 *
 * @module
 */

/** Seeded pseudo-random number generator (xorshift32). */
class PRNG {
  private _state: number;

  constructor(seed: number) {
    this._state = seed === 0 ? 1 : seed | 0;
  }

  /** Returns a 32-bit unsigned integer. */
  next(): number {
    let x = this._state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this._state = x;
    return x >>> 0;
  }

  /** Returns a number in [0, 1). */
  nextFloat(): number {
    return this.next() / 4294967296;
  }

  /** Returns a signed 32-bit integer. */
  nextI32(): number {
    return this.next() | 0;
  }

  /** Returns a number in [min, max). */
  nextRange(min: number, max: number): number {
    return min + (this.next() % (max - min));
  }
}

/** A generator that produces random values of a specific type. */
export interface InputGenerator<T = any> {
  /** Generates a random value using the given PRNG. */
  generate(rng: PRNG): T;
  /** Attempts to shrink a value toward a simpler form. Returns candidates. */
  shrink(value: T): T[];
}

/** Namespace of built-in input generators. */
export const Gen = {
  /** Generates random i32 values across the full 32-bit range. */
  i32(): InputGenerator<number> {
    return {
      generate(rng: PRNG): number {
        return rng.nextI32();
      },
      shrink(value: number): number[] {
        if (value === 0) return [];
        const candidates = [0];
        if (value > 0) candidates.push(Math.floor(value / 2));
        if (value < 0) candidates.push(Math.ceil(value / 2), -value);
        if (Math.abs(value) > 1) candidates.push(value > 0 ? value - 1 : value + 1);
        return candidates;
      },
    };
  },

  /** Generates random i32 values in [min, max). */
  i32Range(min: number, max: number): InputGenerator<number> {
    return {
      generate(rng: PRNG): number {
        return rng.nextRange(min, max);
      },
      shrink(value: number): number[] {
        if (value === min) return [];
        const candidates: number[] = [min];
        const mid = min + Math.floor((value - min) / 2);
        if (mid !== min && mid !== value) candidates.push(mid);
        if (value > min) candidates.push(value - 1);
        return candidates.filter((v) => v >= min && v < max);
      },
    };
  },

  /** Generates random f64 values. */
  f64(): InputGenerator<number> {
    return {
      generate(rng: PRNG): number {
        // Generate a mix of normal values and edge cases
        const r = rng.nextFloat();
        if (r < 0.05) return 0;
        if (r < 0.1) return -0;
        if (r < 0.15) return 1;
        if (r < 0.2) return -1;
        // Random float: sign * mantissa * 2^exponent
        const sign = rng.next() & 1 ? -1 : 1;
        const mantissa = rng.nextFloat();
        const exponent = rng.nextRange(-20, 20);
        return sign * mantissa * Math.pow(2, exponent);
      },
      shrink(value: number): number[] {
        if (value === 0) return [];
        const candidates = [0];
        if (Number.isFinite(value)) {
          candidates.push(value / 2);
          if (Math.abs(value) > 1) {
            candidates.push(Math.trunc(value));
          }
        }
        return candidates;
      },
    };
  },

  /** Generates arrays of values using another generator. */
  array<T>(gen: InputGenerator<T>, len: number): InputGenerator<T[]> {
    return {
      generate(rng: PRNG): T[] {
        const result: T[] = [];
        for (let i = 0; i < len; i++) {
          result.push(gen.generate(rng));
        }
        return result;
      },
      shrink(value: T[]): T[][] {
        const candidates: T[][] = [];
        // Try shrinking each element individually
        for (let i = 0; i < value.length; i++) {
          const shrunk = gen.shrink(value[i]!);
          for (const s of shrunk) {
            const copy = [...value];
            copy[i] = s;
            candidates.push(copy);
          }
        }
        return candidates;
      },
    };
  },
};

/** Options for the fuzz runner. */
export interface FuzzOptions {
  /** Number of random test iterations. */
  iterations: number;
  /** PRNG seed for reproducibility. */
  seed?: number;
  /** Input generators, one per function argument. */
  generators: InputGenerator[];
}

/** A single test failure record. */
export interface FuzzFailure {
  input: any[];
  error: Error;
}

/** Result of a fuzz run. */
export interface FuzzResult {
  passed: number;
  failed: number;
  failures: FuzzFailure[];
}

/**
 * Runs a function with random inputs, catching errors and Wasm traps.
 *
 * When a failure is found, attempts simple shrinking by halving each
 * input value to find a minimal failing case.
 *
 * @param fn - The function to fuzz (typically a Wasm export)
 * @param options - Fuzz configuration
 * @returns Summary with pass/fail counts and failure details
 */
export function fuzz(fn: (...args: any[]) => any, options: FuzzOptions): FuzzResult {
  const rng = new PRNG(options.seed ?? Date.now());
  const result: FuzzResult = { passed: 0, failed: 0, failures: [] };

  for (let i = 0; i < options.iterations; i++) {
    const input = options.generators.map((g) => g.generate(rng));

    try {
      fn(...input);
      result.passed++;
    } catch (e) {
      // Attempt shrinking
      const shrunkInput = shrinkInput(fn, input, options.generators, e as Error);
      result.failed++;
      result.failures.push({
        input: shrunkInput.input,
        error: shrunkInput.error,
      });
    }
  }

  return result;
}

/**
 * Attempts to shrink a failing input to a simpler form.
 * Tries shrinking each argument individually.
 */
function shrinkInput(
  fn: (...args: any[]) => any,
  input: any[],
  generators: InputGenerator[],
  originalError: Error,
): { input: any[]; error: Error } {
  let bestInput = [...input];
  let bestError = originalError;
  let improved = true;

  // Up to 10 shrinking rounds
  for (let round = 0; round < 10 && improved; round++) {
    improved = false;

    for (let i = 0; i < bestInput.length; i++) {
      const gen = generators[i];
      if (!gen) continue;

      const candidates = gen.shrink(bestInput[i]);
      for (const candidate of candidates) {
        const attempt = [...bestInput];
        attempt[i] = candidate;
        try {
          fn(...attempt);
          // This candidate passes — not useful for shrinking
        } catch (e) {
          // Still fails — use the simpler input
          bestInput = attempt;
          bestError = e as Error;
          improved = true;
          break;
        }
      }
    }
  }

  return { input: bestInput, error: bestError };
}
