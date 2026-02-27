/**
 * String matching algorithms operating on byte arrays in linear memory.
 *
 * KMP (Knuth-Morris-Pratt) string matching:
 * - `kmpBuildFailure`: builds the failure function table
 * - `kmpSearch`: finds the first occurrence of a pattern in text
 *
 * Both use Mem.load8/Mem.store for byte-level access.
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl, Loc } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * kmpBuildFailure(pattern, patLen, failureBase) — builds KMP failure function.
 *
 * Reads pattern bytes from `pattern` address (patLen bytes).
 * Writes failure table as i32 array at `failureBase`.
 *
 * Params: pattern (i32), patLen (i32), failureBase (i32).
 */
export const kmpBuildFailure: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: [],
  body: function* () {
    const pattern = yield* param(Type.i32);
    const patLen = yield* param(Type.i32);
    const failureBase = yield* param(Type.i32);

    const failArr = Mem.i32Array(failureBase);

    // failure[0] = 0
    yield* failArr.store(0, 0);

    const i = yield* local(Type.i32, 1);
    const j = yield* local(Type.i32, 0);

    yield* Ctrl.while(i.lt(patLen), function* () {
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          // If pattern[i] == pattern[j], match extends
          yield* Ctrl.when(Mem.load8(pattern.add(i)).eq(Mem.load8(pattern.add(j))), function* () {
            yield* j.incrBy(1);
            yield* failArr.store(i, j);
            yield* i.incrBy(1);
            yield* Ctrl.br(2); // exit block
          });
          // If j > 0, fall back
          yield* Ctrl.when(j.gt(0), function* () {
            yield* j.set(failArr.load(j.sub(1)));
            yield* Ctrl.br(1); // continue loop
          });
          // j == 0 and no match: failure[i] = 0
          yield* failArr.store(i, 0);
          yield* i.incrBy(1);
          yield* Ctrl.br(1); // exit block
        });
      });
    });
  },
};

/**
 * kmpSearch(text, textLen, pattern, patLen, failureBase) — KMP pattern search.
 *
 * Searches for the first occurrence of pattern in text.
 * The failure table at failureBase must be pre-built via kmpBuildFailure.
 *
 * Returns the starting byte index of the first match, or -1 if not found.
 *
 * Params: text (i32), textLen (i32), pattern (i32), patLen (i32), failureBase (i32).
 * Returns: i32.
 */
export const kmpSearch: StdlibFunc = {
  params: ["i32", "i32", "i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const text = yield* param(Type.i32);
    const textLen = yield* param(Type.i32);
    const pattern = yield* param(Type.i32);
    const patLen = yield* param(Type.i32);
    const failureBase = yield* param(Type.i32);

    const failArr = Mem.i32Array(failureBase);

    // Handle empty pattern: return 0
    yield* Ctrl.when(patLen.le(0), function* () {
      yield* Loc.return(0);
    });

    const i = yield* local(Type.i32, 0); // text index
    const j = yield* local(Type.i32, 0); // pattern index

    yield* Ctrl.while(i.lt(textLen), function* () {
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          // If text[i] == pattern[j], advance both
          yield* Ctrl.when(Mem.load8(text.add(i)).eq(Mem.load8(pattern.add(j))), function* () {
            yield* j.incrBy(1);
            yield* i.incrBy(1);
            // If full match found, return start position
            yield* Ctrl.when(j.eq(patLen), function* () {
              yield* Loc.return(i.sub(patLen));
            });
            yield* Ctrl.br(2); // exit block, continue outer while
          });
          // Mismatch: if j > 0, fall back via failure table
          yield* Ctrl.when(j.gt(0), function* () {
            yield* j.set(failArr.load(j.sub(1)));
            yield* Ctrl.br(1); // continue inner loop (retry match)
          });
          // j == 0 and mismatch: advance text
          yield* i.incrBy(1);
          yield* Ctrl.br(1); // exit block
        });
      });
    });

    // No match found
    return -1;
  },
};
