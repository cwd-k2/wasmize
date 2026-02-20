/**
 * Compile-time instruction profiling with zero runtime overhead.
 *
 * Counts each `FuncInstruction` yielded during compilation by type
 * (decl, stmt, if, loop, block). Uses the `intercept()` mechanism
 * to observe instructions without modifying them.
 *
 * @example
 * ```ts
 * const profile = createProfile();
 * const fn = yield* Mod.func(function* () {
 *   return yield* withProfiling(body(), profile);
 * });
 * console.log(profile); // { decls: 2, stmts: 5, ifs: 1, ... }
 * ```
 *
 * @module
 */
import { intercept } from "./intercept";
import type { FuncGen, FuncReturn } from "./types";

export interface InstructionProfile {
  decls: number;
  params: number;
  locals: number;
  stmts: number;
  ifs: number;
  loops: number;
  blocks: number;
  total: number;
}

/** Creates an empty instruction profile. */
export function createProfile(): InstructionProfile {
  return {
    decls: 0,
    params: 0,
    locals: 0,
    stmts: 0,
    ifs: 0,
    loops: 0,
    blocks: 0,
    total: 0,
  };
}

/**
 * Wraps a function generator with compile-time instruction profiling.
 * Counts each yielded FuncInstruction by type. Zero-overhead at runtime.
 */
export function* withProfiling<T extends FuncReturn>(
  gen: FuncGen<T>,
  profile: InstructionProfile,
): FuncGen<T> {
  return yield* intercept(gen, (instr) => {
    profile.total++;
    switch (instr._type) {
      case "decl":
        profile.decls++;
        if (instr.kind === "param") profile.params++;
        else profile.locals++;
        break;
      case "stmt":
        profile.stmts++;
        break;
      case "if":
        profile.ifs++;
        break;
      case "loop":
        profile.loops++;
        break;
      case "block":
        profile.blocks++;
        break;
    }
    return instr;
  });
}
