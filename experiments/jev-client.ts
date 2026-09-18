import { TypeSafeClient, noul, choice } from "@typesafe-ai/sdk";
import type { ProgressCheckInput, JevJudgment, AgentState } from "./types.js";

export const client = new TypeSafeClient();

export const STATE_CRITERIA = {
  PROGRESSING: "The agent is advancing toward `goal` but `goal` is NOT yet fully achieved. A step, an intermediate fix, or a sub-task within the trajectory may have succeeded -- that is exactly what makes this PROGRESSING rather than STALLED -- but the thing `goal` actually asked for is still not done, or not yet confirmed done, as of `latest_step`. This is the correct label for a successful diagnostic step, a successful sub-fix, or a step that rules out a hypothesis, as long as `goal` itself remains open.",
  STALLED: "The agent is busy taking actions, but is not converging on `goal`. It may be repeating the same underlying strategy or assumption under different phrasing, re-trying variations of an approach that has already failed for the same root cause, or producing research/results that look relevant but do not change what the agent knows or can do next.",
  REGRESSING: "The agent's latest actions have undone, broken, or reverted previously made progress, or introduced a new problem while trying to fix the original one, leaving the agent further from `goal` than it was a few steps ago.",
  COMPLETE: "`goal`, read literally as originally stated, has been fully achieved AND this is confirmed by direct evidence in `latest_step` -- not inferred, not merely likely, not a proxy signal, and not just the most recent action succeeding at something narrower than `goal`. If `latest_step` only fixes one contributing cause, finishes one sub-task, or reports success on something short of the literal goal, that is PROGRESSING, not COMPLETE.",
} as const;

export function formatState(input: ProgressCheckInput) {
  return {
    goal: input.goal,
    current_authoritative_state: input.currentState ?? null,
    recent_steps: input.recentSteps.map((s, i) => ({
      index: i + 1,
      action: s.action,
      result: s.result,
    })),
    latest_step: {
      action: input.latestStep.action,
      result: input.latestStep.result,
    },
  };
}

export async function judgeProgress(input: ProgressCheckInput): Promise<JevJudgment> {
  const started = Date.now();
  const state = formatState(input);

  const response = await client.systemOne({
    state,
    questions: {
      advanced: noul(
        "Has `latest_step` materially advanced the agent toward `goal`, beyond what was already known or true after `recent_steps`? Answer no if the latest step only restates, re-attempts, or re-confirms something already established.",
      ),
      progressing: noul(
        "Looking at `recent_steps` plus `latest_step` as a whole, is the agent currently making meaningful progress toward `goal`? Answer yes if the trajectory is converging on new state or information the agent needed. Answer no if the agent is busy but not converging.",
      ),
      repeating: noul(
        "Is the agent effectively repeating the same underlying strategy or assumption across `recent_steps` and `latest_step`, even if the surface-level actions, arguments, or wording differ? Focus on whether the root approach or premise being tested is the same, not whether the literal text of each action is identical.",
      ),
      newEvidence: noul(
        "Has `latest_step` produced new information that changes what the agent knows, rules out, or can now try, compared to what `recent_steps` already established? Answer no if the result is redundant with, or equally uninformative as, prior results.",
      ),
      state: choice(
        "Classify the agent's overall trajectory (`recent_steps` plus `latest_step`) relative to `goal` into exactly one of the four states below.",
        STATE_CRITERIA,
      ),
    },
  });

  const latencyMs = Date.now() - started;
  const stateAnswer = response.answers.state;

  return {
    advancedProbability: response.answers.advanced.noul,
    progressingProbability: response.answers.progressing.noul,
    repeatingProbability: response.answers.repeating.noul,
    newEvidenceProbability: response.answers.newEvidence.noul,
    state: stateAnswer.choice as AgentState,
    stateConfidence: stateAnswer.confidence,
    stateProbabilities: stateAnswer.probabilities as Record<AgentState, number>,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    latencyMs,
  };
}
