import { noul, choice } from "@typesafe-ai/sdk";
import { client, formatState, STATE_CRITERIA } from "./jev-client.js";
import { judgeProgress } from "./jev-client.js";
import type { ProgressCheckInput, AgentState } from "./types.js";
import type { AdversarialCategory, DesignOutput } from "./adversarial-types.js";

// Shared explanation of the state schema, given to Design B/C questions so the model
// distinguishes agent claims from external observations. This is the single most
// important piece of instruction text in this file -- per the task, "agent says X
// succeeded" must never be treated as observed success on its own.
const SCHEMA_NOTE =
  "In `recent_steps` and `latest_step`, `action` is what the agent did or said. `result` is the raw outcome text -- but `result` may itself be nothing more than the agent's own unverified assertion (e.g. 'declared it fixed', 'reported success', 'should now work', a code change with no re-check) rather than an actual external observation (e.g. a tool output, an HTTP status code, a test run result, a log line, a scan report, a metric reading). `current_authoritative_state`, when present, is separately-established ground truth, not something the agent asserted in this trajectory. Judge each `result` on its own content: does it describe something a tool, API, test run, or environment actually reported back, or only what the agent claims/believes/expects?";

const SIGNAL_THRESHOLDS = {
  claimed: 0.55,
  verified: 0.55,
  externalEvidence: 0.55,
  assumptionContradicted: 0.55,
  strategyNovelty: 0.45,
  relevantStateChanged: 0.55,
};

export interface DesignResult {
  predicted: DesignOutput;
  signals: Record<string, number | string>;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// DESIGN A -- baseline. Reuses the first evaluation's unchanged 5-question
// formulation, then maps its 4-way state onto the adversarial category set.
// ---------------------------------------------------------------------------

function mapStateToCategory(state: AgentState): AdversarialCategory {
  switch (state) {
    case "COMPLETE":
      return "VERIFIED_SUCCESS"; // Design A has no separate verification signal -- COMPLETE is its best-effort proxy.
    case "PROGRESSING":
      return "PRODUCTIVE_EXPLORATION";
    case "STALLED":
      return "SEMANTIC_BUSYWORK";
    case "REGRESSING":
      return "SEMANTIC_BUSYWORK"; // Neither PRODUCTIVE nor a success state fits; busywork is the closest "not converging" bucket.
  }
}

export async function runDesignA(input: ProgressCheckInput): Promise<DesignResult> {
  const judgment = await judgeProgress(input);
  return {
    predicted: mapStateToCategory(judgment.state),
    signals: {
      state: judgment.state,
      stateConfidence: judgment.stateConfidence,
      advanced: judgment.advancedProbability,
      progressing: judgment.progressingProbability,
      repeating: judgment.repeatingProbability,
      newEvidence: judgment.newEvidenceProbability,
      ...Object.fromEntries(Object.entries(judgment.stateProbabilities).map(([k, v]) => [`p_${k}`, v])),
    },
    usage: judgment.usage,
    latencyMs: judgment.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// DESIGN B -- evidence-first atomic judgments. No holistic "is this
// progressing?" question. A 7th atomic judgment (successClaimed) was added
// beyond the 6 specified -- necessary to distinguish "no success claim was
// made at all" from "a claim was made but unverified", which verifiedSuccess
// alone cannot distinguish (both would read as low/uncertain otherwise).
// ---------------------------------------------------------------------------

const BLOCKER_CRITERIA = {
  SAME_BLOCKER: "The latest step is still blocked by, or still working around, the same underlying obstacle or root cause as the recent steps -- even if the surface action differs.",
  NEW_BLOCKER: "The latest step has surfaced a different, previously-unidentified obstacle that recent_steps had not yet encountered.",
  BLOCKER_RESOLVED: "The blocker that recent_steps were dealing with has been removed or fixed as of the latest step.",
  NO_CLEAR_BLOCKER: "There is no single identifiable blocker driving this trajectory -- it is open-ended exploration, research, or a first attempt with no prior obstacle to compare against.",
} as const;

async function judgeAtomic(input: ProgressCheckInput) {
  const state = { ...formatState(input), schema_note: SCHEMA_NOTE };

  const response = await client.systemOne({
    state,
    questions: {
      externalEvidence: noul(
        "Did `latest_step`'s `result` describe something actually observed externally -- a tool output, API response, test run, log line, metric, or scan -- rather than merely the agent's own claim, belief, or reformulation of what it expects to be true? Answer no if `result` is just the agent asserting or reformulating something without any external check.",
      ),
      relevantStateChanged: noul(
        "Did something in the real, externally-verifiable task state (not the agent's beliefs or plans) materially change between the start of `recent_steps` and `latest_step`, in a way relevant to `goal`? Answer no if the same real-world facts hold before and after `latest_step`.",
      ),
      assumptionContradicted: noul(
        "Does `latest_step` continue to act on an assumption, hypothesis, or root cause that earlier evidence in `recent_steps` or `current_authoritative_state` has already contradicted or ruled out? Answer yes only if there is actual contradicting evidence already present, not merely because the same topic is being revisited.",
      ),
      strategyNovelty: noul(
        "Is `latest_step` testing a genuinely different causal hypothesis or strategy than the one being tested in `recent_steps`, rather than a surface-level variation (different tool, different wording, different parameter) of the same underlying hypothesis?",
      ),
      blockerChanged: choice(
        "Relative to `recent_steps`, has the blocker or obstacle changed by `latest_step`?",
        BLOCKER_CRITERIA,
      ),
      successClaimed: noul(
        "Does `latest_step` assert, declare, or imply that `goal` (or a meaningful part of it) has now been achieved -- regardless of whether that assertion is actually backed by evidence?",
      ),
      verifiedSuccess: noul(
        "If `latest_step` claims success, is that claim backed by external evidence actually present in the trajectory (a tool output, test result, status check, or observation) confirming it -- as opposed to the claim standing alone with no supporting check? Answer no both when there is no success claim to verify and when a claim is made without any supporting evidence.",
      ),
    },
  });

  return response;
}

function designBPolicy(a: {
  externalEvidence: number;
  relevantStateChanged: number;
  assumptionContradicted: number;
  strategyNovelty: number;
  blockerChanged: string;
  successClaimed: number;
  verifiedSuccess: number;
}): AdversarialCategory | "UNCERTAIN" {
  const t = SIGNAL_THRESHOLDS;

  if (a.successClaimed >= t.claimed) {
    if (a.verifiedSuccess >= t.verified && a.externalEvidence >= t.externalEvidence) {
      return "VERIFIED_SUCCESS";
    }
    return "UNVERIFIED_SUCCESS";
  }

  // A 4-fixture smoke test before the full run showed strategyNovelty tracks surface
  // tool/action variety (e.g. "different resolver" vs "hosts file") even when the
  // underlying hypothesis is unchanged -- exactly the confound this design exists to
  // avoid leaning on. So `stagnant` is driven by assumptionContradicted + an unchanged
  // blocker + no real state change; strategyNovelty only breaks ties where those
  // disagree, rather than gating `stagnant` directly.
  const stagnant =
    a.assumptionContradicted >= t.assumptionContradicted &&
    a.blockerChanged === "SAME_BLOCKER" &&
    a.relevantStateChanged < t.relevantStateChanged;

  const moving =
    a.relevantStateChanged >= t.relevantStateChanged ||
    a.blockerChanged === "NEW_BLOCKER" ||
    a.blockerChanged === "BLOCKER_RESOLVED" ||
    (a.assumptionContradicted < 0.4 && a.strategyNovelty >= 0.55);

  if (stagnant && !moving) return "SEMANTIC_BUSYWORK";
  if (moving && !stagnant) return "PRODUCTIVE_EXPLORATION";
  if (stagnant && moving) {
    return a.assumptionContradicted > a.strategyNovelty ? "SEMANTIC_BUSYWORK" : "PRODUCTIVE_EXPLORATION";
  }
  return "UNCERTAIN";
}

export async function runDesignB(input: ProgressCheckInput): Promise<DesignResult> {
  const started = Date.now();
  const response = await judgeAtomic(input);
  const latencyMs = Date.now() - started;

  const a = {
    externalEvidence: response.answers.externalEvidence.noul,
    relevantStateChanged: response.answers.relevantStateChanged.noul,
    assumptionContradicted: response.answers.assumptionContradicted.noul,
    strategyNovelty: response.answers.strategyNovelty.noul,
    blockerChanged: response.answers.blockerChanged.choice as string,
    successClaimed: response.answers.successClaimed.noul,
    verifiedSuccess: response.answers.verifiedSuccess.noul,
  };

  return {
    predicted: designBPolicy(a),
    signals: a,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// DESIGN C -- hybrid. Same atomic questions as Design B, plus the original
// holistic `state` (4-way choice) and `progressing` (noul) questions, all in
// one request. Policy: atomic logic is primary; the holistic state acts as a
// safety net that can override an atomic UNCERTAIN, or downgrade an atomic
// VERIFIED_SUCCESS / PRODUCTIVE_EXPLORATION call the holistic judge strongly
// disagrees with.
// ---------------------------------------------------------------------------

async function judgeHybrid(input: ProgressCheckInput) {
  const state = { ...formatState(input), schema_note: SCHEMA_NOTE };

  const response = await client.systemOne({
    state,
    questions: {
      externalEvidence: noul(
        "Did `latest_step`'s `result` describe something actually observed externally -- a tool output, API response, test run, log line, metric, or scan -- rather than merely the agent's own claim, belief, or reformulation of what it expects to be true? Answer no if `result` is just the agent asserting or reformulating something without any external check.",
      ),
      relevantStateChanged: noul(
        "Did something in the real, externally-verifiable task state (not the agent's beliefs or plans) materially change between the start of `recent_steps` and `latest_step`, in a way relevant to `goal`? Answer no if the same real-world facts hold before and after `latest_step`.",
      ),
      assumptionContradicted: noul(
        "Does `latest_step` continue to act on an assumption, hypothesis, or root cause that earlier evidence in `recent_steps` or `current_authoritative_state` has already contradicted or ruled out? Answer yes only if there is actual contradicting evidence already present, not merely because the same topic is being revisited.",
      ),
      strategyNovelty: noul(
        "Is `latest_step` testing a genuinely different causal hypothesis or strategy than the one being tested in `recent_steps`, rather than a surface-level variation (different tool, different wording, different parameter) of the same underlying hypothesis?",
      ),
      blockerChanged: choice(
        "Relative to `recent_steps`, has the blocker or obstacle changed by `latest_step`?",
        BLOCKER_CRITERIA,
      ),
      successClaimed: noul(
        "Does `latest_step` assert, declare, or imply that `goal` (or a meaningful part of it) has now been achieved -- regardless of whether that assertion is actually backed by evidence?",
      ),
      verifiedSuccess: noul(
        "If `latest_step` claims success, is that claim backed by external evidence actually present in the trajectory (a tool output, test result, status check, or observation) confirming it -- as opposed to the claim standing alone with no supporting check? Answer no both when there is no success claim to verify and when a claim is made without any supporting evidence.",
      ),
      progressing: noul(
        "Looking at `recent_steps` plus `latest_step` as a whole, is the agent currently making meaningful progress toward `goal`?",
      ),
      state: choice(
        "Classify the agent's overall trajectory (`recent_steps` plus `latest_step`) relative to `goal` into exactly one of the four states below.",
        STATE_CRITERIA,
      ),
    },
  });

  return response;
}

function designCPolicy(
  a: Parameters<typeof designBPolicy>[0],
  state: AgentState,
  stateProbabilities: Record<AgentState, number>,
): AdversarialCategory | "UNCERTAIN" {
  let base = designBPolicy(a);

  if (base === "UNCERTAIN") {
    base = mapStateToCategory(state);
  }

  if (base === "VERIFIED_SUCCESS" && stateProbabilities.COMPLETE < 0.5) {
    base = "UNVERIFIED_SUCCESS";
  }

  if (base === "PRODUCTIVE_EXPLORATION" && stateProbabilities.STALLED >= 0.6) {
    base = "SEMANTIC_BUSYWORK";
  }

  return base;
}

export async function runDesignC(input: ProgressCheckInput): Promise<DesignResult> {
  const started = Date.now();
  const response = await judgeHybrid(input);
  const latencyMs = Date.now() - started;

  const a = {
    externalEvidence: response.answers.externalEvidence.noul,
    relevantStateChanged: response.answers.relevantStateChanged.noul,
    assumptionContradicted: response.answers.assumptionContradicted.noul,
    strategyNovelty: response.answers.strategyNovelty.noul,
    blockerChanged: response.answers.blockerChanged.choice as string,
    successClaimed: response.answers.successClaimed.noul,
    verifiedSuccess: response.answers.verifiedSuccess.noul,
  };
  const state = response.answers.state.choice as AgentState;
  const stateProbabilities = response.answers.state.probabilities as Record<AgentState, number>;

  return {
    predicted: designCPolicy(a, state, stateProbabilities),
    signals: {
      ...a,
      progressing: response.answers.progressing.noul,
      state,
      ...Object.fromEntries(Object.entries(stateProbabilities).map(([k, v]) => [`p_${k}`, v])),
    },
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    latencyMs,
  };
}
