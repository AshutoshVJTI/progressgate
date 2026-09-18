// Minimal pattern for wiring ProgressGate into any tool-calling agent loop.
// No framework assumed -- `nextAgentStep` stands in for whatever calls your model and
// executes its chosen tool; it is left unimplemented here since this file is a pattern
// reference, not a runnable demo. For a real, live version of this exact pattern
// running against an actual LLM agent loop, see experiments/live-agent-test/run.ts.

import { ProgressGate } from "../src/sdk/index.js";
import type { Step } from "../src/sdk/index.js";

// Stand-in for whatever calls your model and executes the tool it picked.
declare function nextAgentStep(goal: string, priorSteps: Step[]): Promise<Step>;

async function runAgent(goal: string) {
  const gate = new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY });
  const run = gate.run({ goal });

  const steps: Step[] = [];
  const MAX_STEPS = 20;

  for (let i = 0; i < MAX_STEPS; i++) {
    const step = await nextAgentStep(goal, steps);
    steps.push(step);

    // Ask ProgressGate before paying for the next model call.
    const gateResult = await run.observe(step);

    if (gateResult.decision === "HALT") {
      // Persistent stagnation or strong regression. Stop spending model calls; surface
      // this to a human or a supervising process instead of looping further.
      console.error(`ProgressGate HALT: ${gateResult.reasonCode}`, gateResult.debugExplanation);
      break;
    }

    if (gateResult.decision === "REPLAN") {
      // Inject structured feedback into the next prompt so the agent is forced off
      // the contradicted assumption, instead of letting it repeat itself.
      const feedback =
        `ProgressGate: your last ${gateResult.consecutiveStagnation} steps have not materially ` +
        `changed the task state (reason: ${gateResult.reasonCode}). Do not repeat the same ` +
        `underlying approach with different surface details -- reconsider the assumption behind it.`;
      steps.push({ action: "system:progressgate-feedback", result: feedback });
      continue;
    }

    if (gateResult.decision === "WARN") {
      console.warn(`ProgressGate WARN: ${gateResult.reasonCode}`);
    }
  }
}

runAgent("Fix the failing deployment").catch(console.error);
