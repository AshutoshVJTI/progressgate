import { writeFileSync, mkdirSync } from "node:fs";
import { fixtures } from "./fixtures.js";
import { judgeProgress } from "./jev-client.js";
import type { AgentState, Fixture, JevJudgment } from "./types.js";

interface FixtureResult {
  id: string;
  category: string;
  obvious: boolean;
  expected: AgentState;
  actual?: AgentState;
  judgment?: JevJudgment;
  error?: string;
  correct?: boolean;
}

const STATES: AgentState[] = ["PROGRESSING", "STALLED", "REGRESSING", "COMPLETE"];

async function runAll(): Promise<FixtureResult[]> {
  const results: FixtureResult[] = [];
  for (const fx of fixtures) {
    process.stdout.write(`[${fx.id}] ${fx.category} ... `);
    try {
      const judgment = await judgeProgress(fx.input);
      const correct = judgment.state === fx.expected;
      results.push({
        id: fx.id,
        category: fx.category,
        obvious: fx.obvious,
        expected: fx.expected,
        actual: judgment.state,
        judgment,
        correct,
      });
      console.log(`${judgment.state} (expected ${fx.expected}) ${correct ? "OK" : "MISS"} [${judgment.latencyMs}ms]`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: fx.id, category: fx.category, obvious: fx.obvious, expected: fx.expected, error: message });
      console.log(`ERROR: ${message}`);
    }
  }
  return results;
}

function buildConfusionMatrix(results: FixtureResult[]) {
  const matrix: Record<AgentState, Record<AgentState, number>> = Object.fromEntries(
    STATES.map((s) => [s, Object.fromEntries(STATES.map((s2) => [s2, 0]))]),
  ) as Record<AgentState, Record<AgentState, number>>;
  for (const r of results) {
    if (!r.actual) continue;
    matrix[r.expected][r.actual] += 1;
  }
  return matrix;
}

function pct(n: number, d: number) {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

function summarize(results: FixtureResult[]) {
  const withAnswer = results.filter((r) => r.actual);
  const errors = results.filter((r) => r.error);
  const obvious = withAnswer.filter((r) => r.obvious);
  const borderline = withAnswer.filter((r) => !r.obvious);

  const obviousCorrect = obvious.filter((r) => r.correct).length;
  const borderlineCorrect = borderline.filter((r) => r.correct).length;
  const overallCorrect = withAnswer.filter((r) => r.correct).length;

  // False STALLED: expected PROGRESSING or COMPLETE, model said STALLED (dangerous: would interrupt real progress)
  const falseStalled = withAnswer.filter(
    (r) => (r.expected === "PROGRESSING" || r.expected === "COMPLETE") && r.actual === "STALLED",
  );
  // False PROGRESSING: expected STALLED or REGRESSING, model said PROGRESSING (dangerous: fails to catch stagnation)
  const falseProgressing = withAnswer.filter(
    (r) => (r.expected === "STALLED" || r.expected === "REGRESSING") && r.actual === "PROGRESSING",
  );
  // Missed regressions: expected REGRESSING, model said anything else
  const missedRegressions = withAnswer.filter((r) => r.expected === "REGRESSING" && r.actual !== "REGRESSING");

  const latencies = withAnswer.map((r) => r.judgment!.latencyMs).sort((a, b) => a - b);
  const p = (q: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : 0);

  return {
    total: results.length,
    answered: withAnswer.length,
    errorCount: errors.length,
    errors: errors.map((r) => ({ id: r.id, error: r.error })),
    obviousTotal: obvious.length,
    obviousCorrect,
    obviousAgreement: pct(obviousCorrect, obvious.length),
    borderlineTotal: borderline.length,
    borderlineCorrect,
    borderlineAgreement: pct(borderlineCorrect, borderline.length),
    overallCorrect,
    overallAgreement: pct(overallCorrect, withAnswer.length),
    falseStalled: falseStalled.map((r) => ({ id: r.id, expected: r.expected, actual: r.actual })),
    falseProgressing: falseProgressing.map((r) => ({ id: r.id, expected: r.expected, actual: r.actual })),
    missedRegressions: missedRegressions.map((r) => ({ id: r.id, expected: r.expected, actual: r.actual })),
    latency: {
      min: latencies[0] ?? 0,
      p50: p(0.5),
      p90: p(0.9),
      max: latencies[latencies.length - 1] ?? 0,
      mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    },
    confusionMatrix: buildConfusionMatrix(results),
  };
}

function renderConfusionMatrix(matrix: Record<AgentState, Record<AgentState, number>>) {
  const header = ["expected\\actual", ...STATES].join(" | ");
  const rows = STATES.map((s) => [s, ...STATES.map((s2) => String(matrix[s][s2]))].join(" | "));
  return [header, ...rows].join("\n");
}

async function main() {
  mkdirSync("experiments/results", { recursive: true });
  const started = Date.now();
  const results = await runAll();
  const summary = summarize(results);
  const totalMs = Date.now() - started;

  writeFileSync("experiments/results/raw.json", JSON.stringify({ results, summary, totalMs }, null, 2));

  const report = `# ProgressGate Jev Evaluation

Run at ${new Date().toISOString()}. ${summary.total} fixtures, ${summary.answered} answered, ${summary.errorCount} errors. Total wall time ${(totalMs / 1000).toFixed(1)}s.

## Agreement

- Obvious cases: ${summary.obviousCorrect}/${summary.obviousTotal} (${summary.obviousAgreement})
- Borderline cases: ${summary.borderlineCorrect}/${summary.borderlineTotal} (${summary.borderlineAgreement})
- Overall: ${summary.overallCorrect}/${summary.answered} (${summary.overallAgreement})

## Confusion matrix (rows = expected, cols = actual)

\`\`\`
${renderConfusionMatrix(summary.confusionMatrix)}
\`\`\`

## False STALLED (dangerous: would interrupt real progress)

${summary.falseStalled.length ? summary.falseStalled.map((r) => `- ${r.id}: expected ${r.expected}, got ${r.actual}`).join("\n") : "none"}

## False PROGRESSING (dangerous: fails to catch stagnation)

${summary.falseProgressing.length ? summary.falseProgressing.map((r) => `- ${r.id}: expected ${r.expected}, got ${r.actual}`).join("\n") : "none"}

## Missed regressions

${summary.missedRegressions.length ? summary.missedRegressions.map((r) => `- ${r.id}: expected ${r.expected}, got ${r.actual}`).join("\n") : "none"}

## Latency (ms)

min ${summary.latency.min} | p50 ${summary.latency.p50} | p90 ${summary.latency.p90} | max ${summary.latency.max} | mean ${summary.latency.mean}

## Errors

${summary.errors.length ? summary.errors.map((e) => `- ${e.id}: ${e.error}`).join("\n") : "none"}
`;

  writeFileSync("experiments/results/report.md", report);
  console.log("\n" + report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
