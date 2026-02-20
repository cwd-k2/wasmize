import type { IRNode } from "../wasm/ir";
import type {
  FuncGen,
  FuncInstruction,
  FuncReturn,
  ModuleGen,
  ModuleInstruction,
} from "./types";

/**
 * Trace entry collected by {@link withTrace}.
 */
export interface TraceEntry {
  label: string;
  instruction: FuncInstruction;
}

/**
 * Intercepts every yielded {@link FuncInstruction} from a function-level generator,
 * applying `transform` before re-yielding to the interpreter.
 *
 * The interpreter's response (e.g. WasmRef from `decl`, WasmVal from valued `if`)
 * is transparently forwarded back to the inner generator.
 *
 * This is the same co-routine proxy pattern as ydant's `keyed()`.
 */
export function* intercept<T extends FuncReturn>(
  gen: FuncGen<T>,
  transform: (instr: FuncInstruction) => FuncInstruction,
): FuncGen<T> {
  let next = gen.next();
  while (!next.done) {
    const response = yield transform(next.value);
    next = gen.next(response);
  }
  return next.value;
}

/**
 * Convenience wrapper that intercepts only `stmt` instructions,
 * transforming the inner {@link IRNode}.
 *
 * Non-stmt instructions (decl, if, loop, block) pass through unchanged.
 */
export function* interceptIR<T extends FuncReturn>(
  gen: FuncGen<T>,
  transform: (node: IRNode) => IRNode,
): FuncGen<T> {
  return yield* intercept(gen, (instr) => {
    if (instr._type === "stmt") {
      return { ...instr, node: transform(instr.node) };
    }
    return instr;
  });
}

/**
 * Non-destructive trace collector.
 * Records every yielded instruction into `collector` without modifying it.
 */
export function* withTrace<T extends FuncReturn>(
  label: string,
  gen: FuncGen<T>,
  collector: TraceEntry[],
): FuncGen<T> {
  return yield* intercept(gen, (instr) => {
    collector.push({ label, instruction: instr });
    return instr;
  });
}

// ── Composition utilities ───────────────────────────────────────────

/**
 * Chains multiple transform functions left-to-right into a single intercept.
 */
export function* composeIntercepts<T extends FuncReturn>(
  gen: FuncGen<T>,
  ...transforms: Array<(instr: FuncInstruction) => FuncInstruction>
): FuncGen<T> {
  const combined = (instr: FuncInstruction) =>
    transforms.reduce((acc, t) => t(acc), instr);
  return yield* intercept(gen, combined);
}

/**
 * Drops stmt instructions that match `shouldDrop`.
 * Declarations (decl) are never dropped for safety.
 */
export function* interceptFilter<T extends FuncReturn>(
  gen: FuncGen<T>,
  shouldDrop: (instr: FuncInstruction) => boolean,
): FuncGen<T> {
  let next = gen.next();
  while (!next.done) {
    const instr = next.value;
    if (instr._type === "stmt" && shouldDrop(instr)) {
      // Skip this instruction — send undefined as response (stmts don't return values)
      next = gen.next(undefined);
    } else {
      const response = yield instr;
      next = gen.next(response);
    }
  }
  return next.value;
}

/**
 * Applies `transform` only when `predicate` matches, otherwise passes through.
 */
export function* interceptWhen<T extends FuncReturn>(
  gen: FuncGen<T>,
  predicate: (instr: FuncInstruction) => boolean,
  transform: (instr: FuncInstruction) => FuncInstruction,
): FuncGen<T> {
  return yield* intercept(gen, (instr) =>
    predicate(instr) ? transform(instr) : instr,
  );
}

/**
 * Module-level intercept: transforms every yielded {@link ModuleInstruction}.
 */
export function* interceptModule(
  gen: ModuleGen<void>,
  transform: (instr: ModuleInstruction) => ModuleInstruction,
): ModuleGen<void> {
  let next = gen.next();
  while (!next.done) {
    const response = yield transform(next.value);
    next = gen.next(response);
  }
}
