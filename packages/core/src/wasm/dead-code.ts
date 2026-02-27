/**
 * Dead code detection for IR function bodies.
 *
 * Scans IR trees for unreachable code: statements after `return`, `br`,
 * `unreachable`, or `if` blocks where both branches terminate.
 * {@link detectDeadCode} returns structured results; {@link formatDeadCode}
 * produces a human-readable report.
 *
 * @module
 */
import type { IRNode } from "./ir";
import type { FuncDef } from "./module";

/** A single dead code finding. */
export interface DeadCodeEntry {
  /** Function index in the input array. */
  funcIndex: number;
  /** Statement index within the body (or nested block) where dead code begins. */
  stmtIndex: number;
  /** Why this code is unreachable. */
  reason: "after-return" | "after-br" | "after-unreachable" | "after-terminating-if";
}

/**
 * Returns true if the given IR node is a terminator (never falls through).
 * Handles `return`, `br`, `unreachable`, and `if` where both branches terminate.
 */
function isTerminator(node: IRNode): boolean {
  switch (node.op) {
    case "return":
    case "br":
    case "unreachable":
      return true;
    case "if":
      // Both branches must terminate
      return (
        node.then.length > 0 &&
        node.else.length > 0 &&
        isTerminator(node.then[node.then.length - 1]!) &&
        isTerminator(node.else[node.else.length - 1]!)
      );
    case "seq":
      return node.stmts.length > 0 && isTerminator(node.stmts[node.stmts.length - 1]!);
    default:
      return false;
  }
}

function reasonForNode(node: IRNode): DeadCodeEntry["reason"] {
  switch (node.op) {
    case "return":
      return "after-return";
    case "br":
      return "after-br";
    case "unreachable":
      return "after-unreachable";
    case "if":
      return "after-terminating-if";
    case "seq": {
      // Find the terminator in the seq
      const last = node.stmts[node.stmts.length - 1]!;
      return reasonForNode(last);
    }
    default:
      return "after-unreachable";
  }
}

/**
 * Scans a list of statement nodes (a function body or block body)
 * for dead code after terminators.
 */
function scanStatements(
  stmts: IRNode[],
  funcIndex: number,
  results: DeadCodeEntry[],
): void {
  for (let i = 0; i < stmts.length; i++) {
    const node = stmts[i]!;

    // Check if this statement is a terminator and there are more statements after it
    if (isTerminator(node) && i + 1 < stmts.length) {
      results.push({
        funcIndex,
        stmtIndex: i + 1,
        reason: reasonForNode(node),
      });
      // No need to continue scanning this block — everything after is dead
      return;
    }

    // Recurse into compound nodes
    scanNode(node, funcIndex, results);
  }
}

function scanNode(node: IRNode, funcIndex: number, results: DeadCodeEntry[]): void {
  switch (node.op) {
    case "if":
      scanStatements(node.then, funcIndex, results);
      scanStatements(node.else, funcIndex, results);
      break;
    case "loop":
      scanStatements(node.body, funcIndex, results);
      break;
    case "block":
      scanStatements(node.body, funcIndex, results);
      break;
    case "seq":
      scanStatements(node.stmts, funcIndex, results);
      break;
    default:
      break;
  }
}

/**
 * Scans IR function definitions for dead code.
 *
 * @returns An array of dead code entries describing unreachable code locations.
 */
export function detectDeadCode(funcs: FuncDef[]): DeadCodeEntry[] {
  const results: DeadCodeEntry[] = [];
  for (let fi = 0; fi < funcs.length; fi++) {
    scanStatements(funcs[fi]!.body, fi, results);
  }
  return results;
}

/**
 * Formats dead code detection results as a human-readable string.
 */
export function formatDeadCode(results: DeadCodeEntry[]): string {
  if (results.length === 0) return "No dead code detected.";

  const lines = results.map((r) => {
    const reasonText = {
      "after-return": "after return statement",
      "after-br": "after unconditional branch",
      "after-unreachable": "after unreachable instruction",
      "after-terminating-if": "after if/else where both branches terminate",
    }[r.reason];
    return `  func[${r.funcIndex}] stmt[${r.stmtIndex}]: dead code ${reasonText}`;
  });

  return `Dead code detected (${results.length} location${results.length > 1 ? "s" : ""}):\n${lines.join("\n")}`;
}
