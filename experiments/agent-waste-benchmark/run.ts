import { mkdir, readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { ProgressGate } from "../../src/sdk/index.js";
import type { RunObserveResult, Step } from "../../src/sdk/index.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const MAX_STEPS = Number(process.env.BENCHMARK_MAX_STEPS || 12);
const MAX_TOKENS = 512;
const OUTPUT_DIR = "experiments/results/agent-waste-benchmark";
const PACKAGE_VERSION = JSON.parse(await readFile("package.json", "utf8")).version as string;

type Category = "stuck" | "healthy";
type ToolKind = "inspect" | "retry" | "alternate" | "verify" | "resolve";

interface ToolSpec {
  name: string;
  description: string;
  kind: ToolKind;
}

interface Scenario {
  id: string;
  category: Category;
  domain: string;
  goal: string;
  blocker: string;
  tools: ToolSpec[];
}

interface EnvState {
  resolved: boolean;
  toolCalls: number;
}

interface TrajectoryEntry {
  step: number;
  action: string;
  result: string;
  gate?: Pick<RunObserveResult, "decision" | "reasonCode" | "confidence" | "signals" | "consecutiveStagnation">;
}

interface RunRecord {
  scenarioId: string;
  category: Category;
  domain: string;
  gated: boolean;
  model: string;
  maxSteps: number;
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finalOutcome: "success" | "max_steps" | "agent_stopped" | "gate_halt" | "error";
  maxStepHit: boolean;
  progressGateIntervened: boolean;
  replanStep: number | null;
  haltStep: number | null;
  productiveRunInterrupted: boolean;
  stepsTaken: number;
  trajectory: TrajectoryEntry[];
  error?: string;
}

const DOMAINS = [
  { name: "permissions", blocker: "the release directory rejects the current identity" },
  { name: "credentials", blocker: "the cached credential is stale and every authenticated request is rejected" },
  { name: "dependencies", blocker: "the required runtime package is absent from this environment" },
  { name: "endpoint", blocker: "the primary service endpoint cannot be reached from this network" },
  { name: "environment", blocker: "the agent is operating in the wrong locked environment" },
  { name: "rate-limit", blocker: "the API is refusing requests until its quota window changes" },
  { name: "file-access", blocker: "the requested file is outside the available mount" },
  { name: "source-data", blocker: "the available sources contradict one another" },
  { name: "browser-state", blocker: "the browser session is stale and its state does not match the target" },
  { name: "capability", blocker: "the required tool capability is unavailable on this host" },
];

function makeScenario(category: Category, index: number): Scenario {
  const domain = DOMAINS[index % DOMAINS.length];
  const variant = Math.floor(index / DOMAINS.length) + 1;
  const suffix = `${domain.name}-${variant}`;
  const common: ToolSpec[] = [
    { name: `${suffix}_inspect`, description: `Inspect the current ${domain.name} state and collect a fresh observation.`, kind: "inspect" },
    { name: `${suffix}_retry`, description: `Retry the operation with the current configuration and record the raw result.`, kind: "retry" },
    { name: `${suffix}_alternate`, description: `Try a different surface-level route, parameter, path, or request shape for the same operation.`, kind: "alternate" },
    { name: `${suffix}_verify`, description: `Verify whether the original goal is now complete using an external check.`, kind: "verify" },
  ];
  if (category === "healthy") {
    common.push({ name: `${suffix}_resolve`, description: `Apply the documented remediation for the discovered blocker, then report the external result.`, kind: "resolve" });
  }
  return {
    id: `${category}-${suffix}`,
    category,
    domain: domain.name,
    goal: `Restore the ${domain.name} workflow for service variant ${variant} and verify the requested change is live.`,
    blocker: domain.blocker,
    tools: common,
  };
}

const SCENARIOS: Scenario[] = [
  ...Array.from({ length: 20 }, (_, i) => makeScenario("stuck", i)),
  ...Array.from({ length: 20 }, (_, i) => makeScenario("healthy", i)),
];

function toolSchema(tool: ToolSpec) {
  return { name: tool.name, description: tool.description, input_schema: { type: "object" as const, properties: { detail: { type: "string" } } } };
}

function callScenarioTool(scenario: Scenario, tool: ToolSpec, input: Record<string, unknown>, state: EnvState): string {
  state.toolCalls += 1;
  const detail = typeof input.detail === "string" ? ` (${input.detail})` : "";
  if (tool.kind === "resolve" && scenario.category === "healthy") {
    state.resolved = true;
    return `Remediation applied for ${scenario.domain}${detail}; external verification now reports success.`;
  }
  if (tool.kind === "verify") {
    return state.resolved ? "External check: goal complete and the change is live." : `External check: still blocked because ${scenario.blocker}.`;
  }
  const outcomes: Record<ToolKind, string> = {
    inspect: `Observation confirms the same blocker: ${scenario.blocker}. No underlying state changed.`,
    retry: `The operation failed again with a different surface response; underlying blocker remains: ${scenario.blocker}.`,
    alternate: `Alternate route produced a new error, but it still depends on the unresolved condition that ${scenario.blocker}.`,
    verify: "",
    resolve: `The remediation could not be applied because ${scenario.blocker}.`,
  };
  return outcomes[tool.kind] + detail;
}

function initialPrompt(scenario: Scenario): string {
  return [
    `Goal: ${scenario.goal}`,
    `Environment note: ${scenario.blocker}.`,
    "You are an operations agent controlling a real tool loop.",
    "Call exactly one tool per turn. Do not narrate while work remains.",
    "Keep investigating with materially different hypotheses until the goal is externally verified, the step limit is reached, or the environment makes success impossible.",
    "Do not claim DONE from intention alone: only stop with DONE after a tool result externally verifies success.",
  ].join("\n\n");
}

function toolUses(content: Anthropic.Message["content"]): Anthropic.ToolUseBlock[] {
  return content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
}

async function runOne(scenario: Scenario, gated: boolean): Promise<RunRecord> {
  const state: EnvState = { resolved: false, toolCalls: 0 };
  const anthropic = new Anthropic();
  const gate = gated ? new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY, allowAutomaticHalt: true }) : null;
  const run = gate?.run({ goal: scenario.goal });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: initialPrompt(scenario) }];
  const trajectory: TrajectoryEntry[] = [];
  let modelCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let progressGateIntervened = false;
  let replanStep: number | null = null;
  let haltStep: number | null = null;
  let finalOutcome: RunRecord["finalOutcome"] = "agent_stopped";
  let error: string | undefined;

  try {
    for (let stepNumber = 1; stepNumber <= MAX_STEPS; stepNumber += 1) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        tools: scenario.tools.map(toolSchema),
        messages,
      });
      modelCalls += 1;
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const uses = toolUses(response.content);
      if (uses.length === 0) {
        finalOutcome = state.resolved ? "success" : "agent_stopped";
        break;
      }

      const results = uses.map((use) => {
        const tool = scenario.tools.find((candidate) => candidate.name === use.name);
        if (!tool) return { use, action: `${use.name}(${JSON.stringify(use.input)})`, result: "Tool unavailable in this environment." };
        return {
          use,
          action: `${use.name}(${JSON.stringify(use.input)})`,
          result: callScenarioTool(scenario, tool, use.input as Record<string, unknown>, state),
        };
      });
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: results.map(({ use, result }) => ({ type: "tool_result" as const, tool_use_id: use.id, content: result })),
      });

      const action = results.map((item) => item.action).join("; ");
      const result = results.map((item) => item.result).join(" | ");
      const step: Step = { action, result };
      const gateResult = run ? await run.observe(step) : undefined;
      trajectory.push({
        step: stepNumber,
        action,
        result,
        ...(gateResult ? { gate: {
          decision: gateResult.decision,
          reasonCode: gateResult.reasonCode,
          confidence: gateResult.confidence,
          signals: gateResult.signals,
          consecutiveStagnation: gateResult.consecutiveStagnation,
        } } : {}),
      });

      if (gateResult?.decision === "REPLAN") {
        progressGateIntervened = true;
        replanStep ??= stepNumber;
        messages.push({ role: "user", content: `[ProgressGate] Replan before the next tool call: ${gateResult.reasonCode}. Reconsider the underlying hypothesis and choose a materially different approach.` });
      }
      if (gateResult?.decision === "HALT") {
        progressGateIntervened = true;
        haltStep = stepNumber;
        finalOutcome = "gate_halt";
        break;
      }
      if (state.resolved) {
        finalOutcome = "success";
        break;
      }
      if (stepNumber === MAX_STEPS) finalOutcome = "max_steps";
    }
  } catch (err) {
    finalOutcome = "error";
    error = err instanceof Error ? err.message : String(err);
  }

  const stepsTaken = trajectory.length;
  return {
    scenarioId: scenario.id,
    category: scenario.category,
    domain: scenario.domain,
    gated,
    model: MODEL,
    maxSteps: MAX_STEPS,
    modelCalls,
    toolCalls: state.toolCalls,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    finalOutcome,
    maxStepHit: finalOutcome === "max_steps",
    progressGateIntervened,
    replanStep,
    haltStep,
    productiveRunInterrupted: scenario.category === "healthy" && finalOutcome === "gate_halt",
    stepsTaken,
    trajectory,
    ...(error ? { error } : {}),
  };
}

function sum(records: RunRecord[], key: keyof RunRecord): number {
  return records.reduce((total, record) => total + Number(record[key]), 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function pct(value: number, total: number): number {
  return total === 0 ? 0 : (value / total) * 100;
}

function buildSummary(records: RunRecord[]) {
  const stuck = records.filter((record) => record.category === "stuck");
  const healthy = records.filter((record) => record.category === "healthy");
  const pair = (gated: boolean, category: Category) => records.filter((record) => record.gated === gated && record.category === category);
  const stuckWithout = pair(false, "stuck");
  const stuckWith = pair(true, "stuck");
  const healthyWithout = pair(false, "healthy");
  const healthyWith = pair(true, "healthy");
  const stepsPrevented = stuckWith.filter((record) => record.haltStep !== null).map((record) => {
    const baseline = stuckWithout.find((candidate) => candidate.scenarioId === record.scenarioId);
    return baseline ? baseline.stepsTaken - record.stepsTaken : 0;
  });
  const largest = stuckWith.map((record) => {
    const baseline = stuckWithout.find((candidate) => candidate.scenarioId === record.scenarioId)!;
    return { scenarioId: record.scenarioId, callsAvoided: baseline.modelCalls - record.modelCalls, tokensAvoided: baseline.totalTokens - record.totalTokens, baseline, gated: record };
  }).sort((a, b) => b.callsAvoided - a.callsAvoided || b.tokensAvoided - a.tokensAvoided)[0];

  return {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    progressgatePackageVersion: PACKAGE_VERSION,
    maxSteps: MAX_STEPS,
    totalRuns: records.length,
    stuckRuns: stuck.length,
    healthyRuns: healthy.length,
    stuck: {
      modelCallsWithoutGate: sum(stuckWithout, "modelCalls"),
      modelCallsWithGate: sum(stuckWith, "modelCalls"),
      modelCallsAvoided: sum(stuckWithout, "modelCalls") - sum(stuckWith, "modelCalls"),
      modelCallReductionPercent: pct(sum(stuckWithout, "modelCalls") - sum(stuckWith, "modelCalls"), sum(stuckWithout, "modelCalls")),
      tokensWithoutGate: sum(stuckWithout, "totalTokens"),
      tokensWithGate: sum(stuckWith, "totalTokens"),
      tokensAvoided: sum(stuckWithout, "totalTokens") - sum(stuckWith, "totalTokens"),
      tokenReductionPercent: pct(sum(stuckWithout, "totalTokens") - sum(stuckWith, "totalTokens"), sum(stuckWithout, "totalTokens")),
      stepsPreventedAverage: stepsPrevented.length ? stepsPrevented.reduce((a, b) => a + b, 0) / stepsPrevented.length : 0,
      stepsPreventedMedian: median(stepsPrevented),
      stepsPreventedMaximum: stepsPrevented.length ? Math.max(...stepsPrevented) : 0,
      maxStepLoopsWithoutGate: stuckWithout.filter((record) => record.maxStepHit).length,
      maxStepLoopsWithGate: stuckWith.filter((record) => record.maxStepHit).length,
      averageStepsWithoutGate: sum(stuckWithout, "stepsTaken") / stuckWithout.length,
      averageStepsWithGate: sum(stuckWith, "stepsTaken") / stuckWith.length,
    },
    healthy: {
      completedWithoutGate: healthyWithout.filter((record) => record.finalOutcome === "success").length,
      completedWithGate: healthyWith.filter((record) => record.finalOutcome === "success").length,
      falseHalts: healthyWith.filter((record) => record.productiveRunInterrupted).length,
      replanThenSucceeded: healthyWith.filter((record) => record.replanStep !== null && record.finalOutcome === "success").length,
      healthyFalseHaltRatePercent: pct(healthyWith.filter((record) => record.productiveRunInterrupted).length, healthyWith.length),
    },
    projectionPer1000SimilarlyStuckRuns: {
      modelCallsAvoided: (sum(stuckWithout, "modelCalls") - sum(stuckWith, "modelCalls")) * 50,
      tokensAvoided: (sum(stuckWithout, "totalTokens") - sum(stuckWith, "totalTokens")) * 50,
      note: "Linear projection from this 20-run stuck test set, not measured production usage.",
    },
    largestReductionObserved: largest ? {
      scenarioId: largest.scenarioId,
      callsAvoided: largest.callsAvoided,
      tokensAvoided: largest.tokensAvoided,
      withoutGate: { modelCalls: largest.baseline.modelCalls, totalTokens: largest.baseline.totalTokens, steps: largest.baseline.stepsTaken, outcome: largest.baseline.finalOutcome },
      withGate: { modelCalls: largest.gated.modelCalls, totalTokens: largest.gated.totalTokens, steps: largest.gated.stepsTaken, outcome: largest.gated.finalOutcome, haltStep: largest.gated.haltStep },
    } : null,
  };
}

function csv(records: RunRecord[]): string {
  const fields = ["scenarioId", "category", "domain", "gated", "model", "maxSteps", "modelCalls", "toolCalls", "inputTokens", "outputTokens", "totalTokens", "finalOutcome", "maxStepHit", "progressGateIntervened", "replanStep", "haltStep", "productiveRunInterrupted", "stepsTaken"] as const;
  return [fields.join(","), ...records.map((record) => fields.map((field) => JSON.stringify(record[field])).join(","))].join("\n") + "\n";
}

function markdown(summary: ReturnType<typeof buildSummary>): string {
  const s = summary.stuck;
  const h = summary.healthy;
  const largest = summary.largestReductionObserved;
  return `# ProgressGate agent waste reduction benchmark

Generated: ${summary.generatedAt}
Model: ${summary.model}
ProgressGate package version: ${summary.progressgatePackageVersion}
Max steps: ${summary.maxSteps}
Runs: ${summary.totalRuns} total (20 stuck + 20 healthy, each run twice)

## Headline measurements

- Stuck model calls: ${s.modelCallsWithoutGate} without gate vs ${s.modelCallsWithGate} with gate (${s.modelCallsAvoided} avoided, ${s.modelCallReductionPercent.toFixed(1)}% reduction).
- Stuck tokens: ${s.tokensWithoutGate} without gate vs ${s.tokensWithGate} with gate (${s.tokensAvoided} avoided, ${s.tokenReductionPercent.toFixed(1)}% reduction).
- Steps prevented on gated stuck runs that halted: average ${s.stepsPreventedAverage.toFixed(2)}, median ${s.stepsPreventedMedian}, maximum ${s.stepsPreventedMaximum}.
- Max-step loops: ${s.maxStepLoopsWithoutGate}/20 without gate vs ${s.maxStepLoopsWithGate}/20 with gate.
- Healthy false-HALT rate: ${h.falseHalts}/20 (${h.healthyFalseHaltRatePercent.toFixed(1)}%).

## Before / after

| Cohort | Metric | Without ProgressGate | With ProgressGate |
|---|---|---:|---:|
| Stuck | Model calls | ${s.modelCallsWithoutGate} | ${s.modelCallsWithGate} |
| Stuck | Tokens | ${s.tokensWithoutGate} | ${s.tokensWithGate} |
| Stuck | Max-step loops | ${s.maxStepLoopsWithoutGate}/20 | ${s.maxStepLoopsWithGate}/20 |
| Stuck | Average steps | ${s.averageStepsWithoutGate.toFixed(2)} | ${s.averageStepsWithGate.toFixed(2)} |
| Healthy | Successful runs | ${h.completedWithoutGate}/20 | ${h.completedWithGate}/20 |
| Healthy | False HALTs | — | ${h.falseHalts}/20 |

## Largest reduction observed

${largest ? `Scenario ${largest.scenarioId}:

- Without ProgressGate: ${largest.withoutGate.modelCalls} model calls, ${largest.withoutGate.totalTokens} tokens, ${largest.withoutGate.steps} steps, ${largest.withoutGate.outcome}.
- With ProgressGate: ${largest.withGate.modelCalls} model calls, ${largest.withGate.totalTokens} tokens, ${largest.withGate.steps} steps, ${largest.withGate.outcome} at step ${largest.withGate.haltStep ?? "n/a"}.
- Result: ${largest.callsAvoided} model calls and ${largest.tokensAvoided} tokens avoided.
` : "No gated stuck run halted."}

## Projection

${summary.projectionPer1000SimilarlyStuckRuns.note} At this measured rate: ${summary.projectionPer1000SimilarlyStuckRuns.modelCallsAvoided} model calls and ${summary.projectionPer1000SimilarlyStuckRuns.tokensAvoided} tokens avoided per 1,000 similarly stuck runs.

## Caveats

This is a 40-scenario end-to-end test set using one model, one max-step setting, deterministic simulated tools, and live model plus Jev calls. It measures this harness, not production usage, model quality, latency, or dollar savings. The healthy cohort is the safety baseline; any false HALT or completion loss must be reported with the waste reductions.
`;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.TYPESAFE_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY and TYPESAFE_API_KEY are required");
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  const records: RunRecord[] = [];
  for (const scenario of SCENARIOS) {
    console.log(`[benchmark] ${scenario.id} without gate`);
    records.push(await runOne(scenario, false));
    console.log(`[benchmark] ${scenario.id} with gate`);
    records.push(await runOne(scenario, true));
  }
  const summary = buildSummary(records);
  await writeFile(`${OUTPUT_DIR}/trajectories.json`, JSON.stringify({ generatedAt: summary.generatedAt, model: MODEL, progressgatePackageVersion: PACKAGE_VERSION, maxSteps: MAX_STEPS, records }, null, 2));
  await writeFile(`${OUTPUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));
  await writeFile(`${OUTPUT_DIR}/runs.csv`, csv(records));
  await writeFile(`${OUTPUT_DIR}/summary.md`, markdown(summary));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
