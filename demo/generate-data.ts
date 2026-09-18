import { writeFileSync, mkdirSync } from "node:fs";
import { ProgressGate } from "../src/sdk/index.js";
import type { GateResult } from "../src/sdk/index.js";
import { demoScenarios, type DemoScenario } from "./scenarios.js";

// DEMO ESTIMATE ASSUMPTIONS -- configured, not measured. Used only to render an
// illustrative "calls prevented / tokens avoided" counter after a HALT in the local
// demo. Not derived from any evaluation result.
const DEMO_ASSUMPTIONS = {
  assumedMaxStepsWithoutGate: 14,
  tokensPerWastedAgentStep: { input: 3200, output: 900 },
  costPerMillionTokens: { input: 3, output: 15 },
};

interface DemoStepResult {
  index: number;
  action: string;
  result: string;
  decision: GateResult["decision"];
  reasonCode: GateResult["reasonCode"];
  confidence: number;
  signals: GateResult["signals"];
  consecutiveStagnation: number;
}

interface DemoScenarioResult {
  id: string;
  label: string;
  goal: string;
  steps: DemoStepResult[];
  haltedAtStep: number | null;
  estimate: {
    assumedMaxStepsWithoutGate: number;
    stepsPrevented: number;
    tokensAvoided: { input: number; output: number };
    estimatedCostAvoidedUsd: number;
  } | null;
}

async function runScenario(gate: ProgressGate, scenario: DemoScenario): Promise<DemoScenarioResult> {
  const run = gate.run({ goal: scenario.goal });
  const steps: DemoStepResult[] = [];
  let haltedAtStep: number | null = null;

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const result = await run.observe(step);

    steps.push({
      index: i + 1,
      action: step.action,
      result: step.result,
      decision: result.decision,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      signals: result.signals,
      consecutiveStagnation: result.consecutiveStagnation,
    });

    console.log(`[${scenario.id}] step ${i + 1}: ${result.decision} (${result.reasonCode})`);

    if (result.decision === "HALT") {
      haltedAtStep = i + 1;
      break;
    }
  }

  let estimate: DemoScenarioResult["estimate"] = null;
  if (haltedAtStep !== null) {
    const stepsPrevented = Math.max(0, DEMO_ASSUMPTIONS.assumedMaxStepsWithoutGate - haltedAtStep);
    const tokensAvoided = {
      input: stepsPrevented * DEMO_ASSUMPTIONS.tokensPerWastedAgentStep.input,
      output: stepsPrevented * DEMO_ASSUMPTIONS.tokensPerWastedAgentStep.output,
    };
    const estimatedCostAvoidedUsd =
      (tokensAvoided.input / 1_000_000) * DEMO_ASSUMPTIONS.costPerMillionTokens.input +
      (tokensAvoided.output / 1_000_000) * DEMO_ASSUMPTIONS.costPerMillionTokens.output;
    estimate = { assumedMaxStepsWithoutGate: DEMO_ASSUMPTIONS.assumedMaxStepsWithoutGate, stepsPrevented, tokensAvoided, estimatedCostAvoidedUsd };
  }

  return { id: scenario.id, label: scenario.label, goal: scenario.goal, steps, haltedAtStep, estimate };
}

async function main() {
  mkdirSync("demo", { recursive: true });
  // allowAutomaticHalt: true only for this demo build, to illustrate the full pipeline
  // reaching HALT. The SDK default is false -- see README "Safe defaults".
  const gate = new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY, allowAutomaticHalt: true });
  const results: DemoScenarioResult[] = [];
  for (const scenario of demoScenarios) {
    results.push(await runScenario(gate, scenario));
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    note: "All decisions and signals below are real, captured ProgressGate SDK output against the live Jev API (not simulated). The demo UI replays this recording for deterministic, repeatable playback.",
    assumptions: DEMO_ASSUMPTIONS,
    scenarios: results,
  };
  writeFileSync("demo/data.json", JSON.stringify(payload, null, 2));
  console.log("\nWrote demo/data.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
