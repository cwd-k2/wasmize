import { runTests } from "../src/runner";

export async function main(): Promise<void> {
  const results = await runTests();
  const container = document.getElementById("problems")!;

  results.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = `problem ${idx === 0 ? "open" : ""}`;

    div.innerHTML = `
      <div class="problem-header">
        <span class="problem-num">#${r.num}</span>
        <span class="problem-title">${r.title}</span>
        <span class="problem-status ${r.pass ? "status-pass" : "status-fail"}">
          ${r.pass ? "\u2713 PASS" : "\u2717 FAIL"}
        </span>
      </div>
      <div class="problem-body">
        <div class="section-label">Output</div>
        <pre class="output-line">${r.output}</pre>
        ${r.effects ? `<div class="section-label">Effects</div><pre class="effect-line">${r.effects}</pre>` : ""}
        <div class="section-label">Test Results</div>
        <pre>${r.tests
          .map(
            (t) =>
              `${t.got === t.expected ? "\u2713" : "\u2717"} ${t.input} \u2192 expected ${t.expected}, got ${t.got}`,
          )
          .join("\n")}</pre>
        <div class="section-label">Details</div>
        <pre class="comment">${r.detail}</pre>
        <div class="section-label">Generated WAT</div>
        <pre class="wat-code">${r.wat}</pre>
        <div class="stats">
          Wasm binary: <span>${r.wasmSize} bytes</span>
          &nbsp;|&nbsp; Tests: <span>${r.tests.filter((t) => t.got === t.expected).length}/${r.tests.length}</span>
        </div>
      </div>
    `;

    div.querySelector(".problem-header")!.addEventListener("click", () =>
      div.classList.toggle("open"),
    );
    container.appendChild(div);
  });

  const allPass = results.every((r) => r.pass);
  const totalTests = results.reduce((s, r) => s + r.tests.length, 0);
  const passedTests = results.reduce(
    (s, r) => s + r.tests.filter((t) => t.got === t.expected).length,
    0,
  );
  const totalWasm = results.reduce((s, r) => s + r.wasmSize, 0);

  const summary = document.getElementById("summary")!;
  summary.style.display = "block";
  summary.innerHTML = `
    <div class="summary-title">${allPass ? "\u2713 All Problems Passed" : "\u2717 Some Problems Failed"}</div>
    <div>Tests: ${passedTests}/${totalTests} passed &nbsp;|&nbsp; Total Wasm: ${totalWasm} bytes &nbsp;|&nbsp; Problems: ${results.length}</div>
    <div style="margin-top:0.5rem;color:var(--dim);font-size:0.75rem;">
      Pipeline: IR nodes \u2192 LEB128 encoder \u2192 Wasm binary \u2192 WebAssembly.instantiate() \u2192 trampoline runner<br>
      Effect system: import functions as effect handlers (Hanoi moves captured as data)
    </div>
  `;
}
