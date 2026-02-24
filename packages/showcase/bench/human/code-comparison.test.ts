import { describe, test } from "vitest";
// @ts-expect-error no @types/node in this project
import { readFileSync } from "node:fs";
// @ts-expect-error no @types/node in this project
import { resolve, dirname } from "node:path";
// @ts-expect-error no @types/node in this project
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

interface Metrics {
  loc: number;
  maxDepth: number;
  controlFlow: number;
  variables: number;
}

function readSource(relPath: string): string {
  return readFileSync(resolve(root, relPath), "utf-8");
}

function countNonEmpty(src: string): number {
  return src.split("\n").filter((l) => l.trim().length > 0).length;
}

function maxIndentDepth(src: string): number {
  let max = 0;
  for (const line of src.split("\n")) {
    if (line.trim().length === 0) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    const depth = Math.ceil(indent / 2);
    if (depth > max) max = depth;
  }
  return max;
}

function countJsControl(src: string): number {
  const patterns = [/\bif\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\breturn\b/g];
  return patterns.reduce((sum, p) => sum + (src.match(p)?.length ?? 0), 0);
}

function countDslControl(src: string): number {
  const patterns = [
    /Ctrl\.if\b/g,
    /Ctrl\.loop\b/g,
    /Ctrl\.block\b/g,
    /Ctrl\.br_if\b/g,
    /Ctrl\.br\b(?!_)/g,
  ];
  return patterns.reduce((sum, p) => sum + (src.match(p)?.length ?? 0), 0);
}

function countJsVars(src: string): number {
  return src.match(/\b(let|const)\s+\w+/g)?.length ?? 0;
}

function countDslVars(src: string): number {
  return src.match(/\b(param|local)\s*\(/g)?.length ?? 0;
}

function analyzeJs(src: string): Metrics {
  return {
    loc: countNonEmpty(src),
    maxDepth: maxIndentDepth(src),
    controlFlow: countJsControl(src),
    variables: countJsVars(src),
  };
}

function analyzeDsl(src: string): Metrics {
  return {
    loc: countNonEmpty(src),
    maxDepth: maxIndentDepth(src),
    controlFlow: countDslControl(src),
    variables: countDslVars(src),
  };
}

const problems = [
  { name: "fibonacci", js: "jsFib", dsl: "examples/problems/fibonacci.ts" },
  { name: "hanoi", js: "jsHanoi", dsl: "examples/problems/hanoi.ts" },
  { name: "kadane", js: "jsKadane", dsl: "examples/problems/kadane.ts" },
  { name: "coin-change", js: "jsCoinChange", dsl: "examples/problems/coin-change.ts" },
  { name: "binary-search", js: "jsBinarySearch", dsl: "examples/problems/binary-search.ts" },
  { name: "gcd-array", js: "jsGcdArray", dsl: "examples/problems/gcd.ts" },
  { name: "sieve", js: "jsSieve", dsl: "examples/problems/sieve.ts" },
  { name: "matmul", js: "jsMatmul", dsl: "examples/problems/matmul.ts" },
  { name: "lcs", js: "jsLcs", dsl: "examples/problems/lcs.ts" },
  { name: "knapsack", js: "jsKnapsack", dsl: "examples/problems/knapsack.ts" },
  { name: "quicksort", js: "jsQuicksort", dsl: "examples/problems/quicksort.ts" },
  { name: "flood-fill", js: "jsFloodFill", dsl: "examples/problems/flood-fill.ts" },
  { name: "lis", js: "jsLis", dsl: "examples/problems/lis.ts" },
  { name: "nqueens", js: "jsNqueens", dsl: "examples/problems/nqueens.ts" },
  { name: "union-find", js: "JsUnionFind", dsl: "examples/problems/union-find.ts" },
];

function extractJsFunc(fullSrc: string, funcName: string): string {
  const lines = fullSrc.split("\n");
  const start = lines.findIndex((l) => l.includes(`function ${funcName}`));
  if (start === -1) return "";
  let depth = 0;
  let end = start;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth === 0 && i > start) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end + 1).join("\n");
}

describe("Human Interface: Code Comparison", () => {
  test("metrics report", () => {
    const jsSrc = readSource("bench/js-impls.ts");

    const rows: string[] = [];
    for (const p of problems) {
      const jsFunc = extractJsFunc(jsSrc, p.js);
      const dslSrc = readSource(p.dsl);
      const js = analyzeJs(jsFunc);
      const dsl = analyzeDsl(dslSrc);
      const ratio = js.loc > 0 ? (dsl.loc / js.loc).toFixed(1) + "x" : "N/A";

      rows.push(
        `| ${p.name.padEnd(15)} | ${String(js.loc).padStart(6)} | ${String(dsl.loc).padStart(7)} | ${ratio.padStart(5)} | ${String(js.maxDepth).padStart(8)} | ${String(dsl.maxDepth).padStart(9)} | ${String(js.controlFlow).padStart(7)} | ${String(dsl.controlFlow).padStart(7)} | ${String(js.variables).padStart(6)} | ${String(dsl.variables).padStart(6)} |`,
      );
    }

    const report = [
      "",
      "## Human Interface Benchmark: Code Comparison",
      "",
      "| Problem         | JS LoC | DSL LoC | Ratio | JS Depth | DSL Depth | JS Ctrl | DSL Ctrl | JS Var | DSL Var |",
      "|-----------------|--------|---------|-------|----------|-----------|---------|----------|--------|---------|",
      ...rows,
      "",
      "## Qualitative Observations",
      "",
      "- **LoC ratio**: DSL implementations are typically 2-4x longer due to `yield*` ceremony and explicit memory management",
      "- **Nesting depth**: DSL code nests deeper because of `function*(){}` closures inside `Ctrl.if/loop/block`",
      "- **Control flow**: DSL uses structured `Ctrl.if/loop/block/br` vs JS `if/for/while/return`",
      "- **Variables**: DSL requires explicit `param()`/`local()` declarations with type annotations",
      "- **Memory model**: DSL directly addresses linear memory (`Mem.load/store`) while JS uses native arrays",
      "- **Chainable API**: `n.le(1)`, `i.add(1)` provide readable inline expressions despite the overhead",
    ];

    console.log(report.join("\n"));
  });
});
