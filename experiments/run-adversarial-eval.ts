import { writeFileSync, mkdirSync } from "node:fs";
import { adversarialFixtures } from "./adversarial-fixtures.js";
import { runDesignA, runDesignB, runDesignC } from "./adversarial-designs.js";
import type { AdversarialCategory, DesignName, DesignOutput, DesignRunResult } from "./adversarial-types.js";

const CATEGORIES: AdversarialCategory[] = [
  "PRODUCTIVE_EXPLORATION",
  "SEMANTIC_BUSYWORK",
  "UNVERIFIED_SUCCESS",
  "VERIFIED_SUCCESS",
];
const OUTPUT_LABELS: DesignOutput[] = [...CATEGORIES, "UNCERTAIN"];

const RUNNERS: Record<DesignName, typeof runDesignA> = {
  A: runDesignA,
  B: runDesignB,
  C: runDesignC,
};

async function runDesign(design: DesignName): Promise<DesignRunResult[]> {
  const results: DesignRunResult[] = [];
  const runner = RUNNERS[design];
  for (const fx of adversarialFixtures) {
    process.stdout.write(`[${design}] [${fx.id}] ${fx.category} ... `);
    try {
      const r = await runner(fx.input);
      const correct = r.predicted === fx.category;
      results.push({
        design,
        fixtureId: fx.id,
        expected: fx.category,
        predicted: r.predicted,
        correct,
        latencyMs: r.latencyMs,
        usage: r.usage,
        signals: r.signals,
      });
      console.log(`${r.predicted} ${correct ? "OK" : "MISS"} [${r.latencyMs}ms]`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        design,
        fixtureId: fx.id,
        expected: fx.category,
        predicted: "UNCERTAIN",
        correct: false,
        latencyMs: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        signals: {},
        error: message,
      });
      console.log(`ERROR: ${message}`);
    }
  }
  return results;
}

function confusionMatrix(results: DesignRunResult[]) {
  const matrix: Record<string, Record<string, number>> = Object.fromEntries(
    CATEGORIES.map((c) => [c, Object.fromEntries(OUTPUT_LABELS.map((o) => [o, 0]))]),
  );
  for (const r of results) {
    matrix[r.expected][r.predicted] += 1;
  }
  return matrix;
}

function renderMatrix(matrix: Record<string, Record<string, number>>) {
  const short: Record<string, string> = {
    PRODUCTIVE_EXPLORATION: "PRODUCTIVE",
    SEMANTIC_BUSYWORK: "BUSYWORK",
    UNVERIFIED_SUCCESS: "UNVERIFIED",
    VERIFIED_SUCCESS: "VERIFIED",
    UNCERTAIN: "UNCERTAIN",
  };
  const header = ["expected\\predicted", ...OUTPUT_LABELS.map((o) => short[o])].join(" | ");
  const rows = CATEGORIES.map((c) => [short[c], ...OUTPUT_LABELS.map((o) => String(matrix[c][o]))].join(" | "));
  return [header, ...rows].join("\n");
}

function pct(n: number, d: number) {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function perCategoryAccuracy(results: DesignRunResult[]) {
  return Object.fromEntries(
    CATEGORIES.map((c) => {
      const subset = results.filter((r) => r.expected === c);
      const correct = subset.filter((r) => r.correct).length;
      return [c, { correct, total: subset.length, pct: pct(correct, subset.length) }];
    }),
  );
}

// The 4 headline metrics from the brief, plus overall accuracy.
function keyMetrics(results: DesignRunResult[]) {
  const productive = results.filter((r) => r.expected === "PRODUCTIVE_EXPLORATION");
  const busywork = results.filter((r) => r.expected === "SEMANTIC_BUSYWORK");
  const unverified = results.filter((r) => r.expected === "UNVERIFIED_SUCCESS");
  const verified = results.filter((r) => r.expected === "VERIFIED_SUCCESS");

  const falseStopRate = productive.filter((r) => r.predicted === "SEMANTIC_BUSYWORK").length; // dangerous: false-stop
  const busyworkMissRate = busywork.filter((r) => r.predicted === "PRODUCTIVE_EXPLORATION").length; // core value metric
  const unverifiedAcceptedRate = unverified.filter((r) => r.predicted === "VERIFIED_SUCCESS").length;
  const verifiedRejectedRate = verified.filter((r) => r.predicted !== "VERIFIED_SUCCESS").length;

  const latencies = results.filter((r) => !r.error).map((r) => r.latencyMs).sort((a, b) => a - b);
  const p = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : 0);

  const overallCorrect = results.filter((r) => r.correct).length;

  return {
    falseStop: { count: falseStopRate, of: productive.length, rate: pct(falseStopRate, productive.length) },
    busyworkMiss: { count: busyworkMissRate, of: busywork.length, rate: pct(busyworkMissRate, busywork.length) },
    unverifiedAccepted: { count: unverifiedAcceptedRate, of: unverified.length, rate: pct(unverifiedAcceptedRate, unverified.length) },
    verifiedRejected: { count: verifiedRejectedRate, of: verified.length, rate: pct(verifiedRejectedRate, verified.length) },
    overall: { count: overallCorrect, of: results.length, rate: pct(overallCorrect, results.length) },
    latency: { p50: p(0.5), p90: p(0.9), mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0 },
    errors: results.filter((r) => r.error).length,
  };
}

// For B and C: correlate each numeric atomic signal with whether the fixture was
// truly PRODUCTIVE vs truly BUSYWORK, as a simple point-biserial-style mean gap.
function signalSeparation(results: DesignRunResult[]) {
  const relevant = results.filter((r) => r.expected === "PRODUCTIVE_EXPLORATION" || r.expected === "SEMANTIC_BUSYWORK");
  if (relevant.length === 0) return [];
  const numericKeys = Object.keys(relevant[0].signals).filter((k) => typeof relevant[0].signals[k] === "number");

  return numericKeys
    .map((key) => {
      const productiveVals = relevant.filter((r) => r.expected === "PRODUCTIVE_EXPLORATION").map((r) => Number(r.signals[key]));
      const busyworkVals = relevant.filter((r) => r.expected === "SEMANTIC_BUSYWORK").map((r) => Number(r.signals[key]));
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const gap = mean(productiveVals) - mean(busyworkVals);
      return { key, meanProductive: mean(productiveVals), meanBusywork: mean(busyworkVals), gap };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

async function main() {
  mkdirSync("experiments/results", { recursive: true });
  const started = Date.now();

  const resultsA = await runDesign("A");
  const resultsB = await runDesign("B");
  const resultsC = await runDesign("C");

  const totalMs = Date.now() - started;

  const summary = {
    A: { matrix: confusionMatrix(resultsA), perCategory: perCategoryAccuracy(resultsA), key: keyMetrics(resultsA) },
    B: { matrix: confusionMatrix(resultsB), perCategory: perCategoryAccuracy(resultsB), key: keyMetrics(resultsB), signals: signalSeparation(resultsB) },
    C: { matrix: confusionMatrix(resultsC), perCategory: perCategoryAccuracy(resultsC), key: keyMetrics(resultsC), signals: signalSeparation(resultsC) },
  };

  writeFileSync(
    "experiments/results/adversarial-raw.json",
    JSON.stringify({ resultsA, resultsB, resultsC, summary, totalMs }, null, 2),
  );

  const report = `# ProgressGate Adversarial Evaluation (Designs A/B/C)

Run at ${new Date().toISOString()}. ${adversarialFixtures.length} fixtures x 3 designs = ${adversarialFixtures.length * 3} Jev calls. Total wall time ${(totalMs / 1000).toFixed(1)}s.

## Design A (baseline, unchanged 5-question formulation)

\`\`\`
${renderMatrix(summary.A.matrix)}
\`\`\`

${Object.entries(summary.A.perCategory).map(([c, v]) => `- ${c}: ${v.correct}/${v.total} (${v.pct})`).join("\n")}

Overall: ${summary.A.key.overall.count}/${summary.A.key.overall.of} (${summary.A.key.overall.rate})

## Design B (evidence-first atomic judgments)

\`\`\`
${renderMatrix(summary.B.matrix)}
\`\`\`

${Object.entries(summary.B.perCategory).map(([c, v]) => `- ${c}: ${v.correct}/${v.total} (${v.pct})`).join("\n")}

Overall: ${summary.B.key.overall.count}/${summary.B.key.overall.of} (${summary.B.key.overall.rate})

## Design C (hybrid: atomic + holistic state)

\`\`\`
${renderMatrix(summary.C.matrix)}
\`\`\`

${Object.entries(summary.C.perCategory).map(([c, v]) => `- ${c}: ${v.correct}/${v.total} (${v.pct})`).join("\n")}

Overall: ${summary.C.key.overall.count}/${summary.C.key.overall.of} (${summary.C.key.overall.rate})

## Side-by-side

| metric | A | B | C |
|---|---|---|---|
| false-stop (productive -> busywork) | ${summary.A.key.falseStop.rate} (${summary.A.key.falseStop.count}/${summary.A.key.falseStop.of}) | ${summary.B.key.falseStop.rate} (${summary.B.key.falseStop.count}/${summary.B.key.falseStop.of}) | ${summary.C.key.falseStop.rate} (${summary.C.key.falseStop.count}/${summary.C.key.falseStop.of}) |
| busywork miss (busywork -> productive) | ${summary.A.key.busyworkMiss.rate} (${summary.A.key.busyworkMiss.count}/${summary.A.key.busyworkMiss.of}) | ${summary.B.key.busyworkMiss.rate} (${summary.B.key.busyworkMiss.count}/${summary.B.key.busyworkMiss.of}) | ${summary.C.key.busyworkMiss.rate} (${summary.C.key.busyworkMiss.count}/${summary.C.key.busyworkMiss.of}) |
| unverified accepted as verified | ${summary.A.key.unverifiedAccepted.rate} (${summary.A.key.unverifiedAccepted.count}/${summary.A.key.unverifiedAccepted.of}) | ${summary.B.key.unverifiedAccepted.rate} (${summary.B.key.unverifiedAccepted.count}/${summary.B.key.unverifiedAccepted.of}) | ${summary.C.key.unverifiedAccepted.rate} (${summary.C.key.unverifiedAccepted.count}/${summary.C.key.unverifiedAccepted.of}) |
| verified rejected | ${summary.A.key.verifiedRejected.rate} (${summary.A.key.verifiedRejected.count}/${summary.A.key.verifiedRejected.of}) | ${summary.B.key.verifiedRejected.rate} (${summary.B.key.verifiedRejected.count}/${summary.B.key.verifiedRejected.of}) | ${summary.C.key.verifiedRejected.rate} (${summary.C.key.verifiedRejected.count}/${summary.C.key.verifiedRejected.of}) |
| overall accuracy | ${summary.A.key.overall.rate} | ${summary.B.key.overall.rate} | ${summary.C.key.overall.rate} |
| p50 latency (ms) | ${summary.A.key.latency.p50} | ${summary.B.key.latency.p50} | ${summary.C.key.latency.p50} |
| p90 latency (ms) | ${summary.A.key.latency.p90} | ${summary.B.key.latency.p90} | ${summary.C.key.latency.p90} |
| API errors | ${summary.A.key.errors} | ${summary.B.key.errors} | ${summary.C.key.errors} |

## Best atomic signals (Design B) -- mean(productive) - mean(busywork), sorted by |gap|

${summary.B.signals.map((s) => `- ${s.key}: gap ${s.gap.toFixed(2)} (productive mean ${s.meanProductive.toFixed(2)}, busywork mean ${s.meanBusywork.toFixed(2)})`).join("\n")}

## Best atomic signals (Design C) -- mean(productive) - mean(busywork), sorted by |gap|

${summary.C.signals.map((s) => `- ${s.key}: gap ${s.gap.toFixed(2)} (productive mean ${s.meanProductive.toFixed(2)}, busywork mean ${s.meanBusywork.toFixed(2)})`).join("\n")}
`;

  writeFileSync("experiments/results/adversarial-report.md", report);
  console.log("\n" + report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
