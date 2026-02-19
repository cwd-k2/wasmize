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
