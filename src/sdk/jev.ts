import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import type { CheckInput, SemanticSignals } from "./types.js";

// Tells Jev to distinguish an agent's own claims from things actually observed --
// otherwise "declared it fixed" reads the same as a passing test result.
const SCHEMA_NOTE =
  "In `recent_steps` and `latest_step`, `action` is what the agent did. `result` is the raw outcome -- but it may be nothing more than the agent's own unverified claim ('declared it fixed', 'should now work') rather than an actual external observation (tool output, API response, test result, log line, metric). `authoritative_state`, when present, is separately-established ground truth, not something the agent asserted in this trajectory. Judge each `result` on its content: did something external actually report this back, or is it only what the agent claims or expects?";

function formatState(input: CheckInput) {
  return {
    goal: input.goal,
    authoritative_state: input.authoritativeState ?? null,
    recent_steps: input.recentSteps.map((s, i) => ({ index: i + 1, action: s.action, result: s.result })),
    latest_step: { action: input.latestStep.action, result: input.latestStep.result },
    schema_note: SCHEMA_NOTE,
  };
}

export interface JevResponse {
  signals: SemanticSignals;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export async function fetchSignals(client: TypeSafeClient, input: CheckInput): Promise<JevResponse> {
  const started = Date.now();
  const state = formatState(input);

  const response = await client.systemOne({
    state,
    questions: {
      assumptionContradicted: noul(
        "Does `latest_step` continue to rely on an assumption, hypothesis, or root cause that evidence already present in `recent_steps` or `authoritative_state` has contradicted or ruled out? Answer yes only when there is actual contradicting evidence already present, not merely because the same general topic is being revisited.",
      ),
      strategyNovelty: noul(
        "Is `latest_step` testing a genuinely different underlying strategy or causal hypothesis than the one being tested across `recent_steps`, rather than a surface-level variation -- different tool, different wording, different parameter -- of the same underlying hypothesis?",
      ),
      materialProgress: noul(
        "Did `latest_step` materially move the real, externally-verifiable task state toward `goal` -- not the agent's stated plan or belief, but the actual state of the system, code, data, or environment? Answer no if the real state relevant to `goal` is unchanged from before `latest_step`, even if the agent took an action.",
      ),
      newUsefulEvidence: noul(
        "Did `latest_step` produce evidence that meaningfully changes what is known about `goal`, or what the agent should reasonably try next -- ruling something in, ruling something out, or surfacing a new fact? Answer no if the result is redundant with, or no more informative than, what `recent_steps` already established.",
      ),
      regression: noul(
        "Did `latest_step` undo, contradict, or move away from progress already established in `recent_steps` or `authoritative_state` -- breaking something that was working, reverting a fix, or introducing a new problem while addressing the original one? Answer no if nothing already-working was undone, even if `latest_step` itself failed to help.",
      ),
      holisticStalled: noul(
        "Taking `recent_steps` and `latest_step` together as a whole trajectory, is the agent currently semantically stalled with respect to `goal` -- busy taking actions, but not converging on it?",
      ),
    },
  });

  const latencyMs = Date.now() - started;

  return {
    signals: {
      assumptionContradicted: response.answers.assumptionContradicted.noul,
      strategyNovelty: response.answers.strategyNovelty.noul,
      materialProgress: response.answers.materialProgress.noul,
      newUsefulEvidence: response.answers.newUsefulEvidence.noul,
      regression: response.answers.regression.noul,
      holisticStalled: response.answers.holisticStalled.noul,
    },
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    latencyMs,
  };
}
