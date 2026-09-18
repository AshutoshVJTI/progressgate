import type { Decision, PolicyConfig, ReasonCode, SemanticSignals } from "./types.js";

// Jev supplies semantic signals; this module is the only place that turns them into
// an intervention. Nothing here calls Jev, executes a tool, or blocks anything itself.
//
// Two bands (STRONG/WEAK) instead of one cutoff -- real signals sit close enough to a
// single threshold that a bare >= flips on noise. REPLAN needs a strong signal plus
// corroboration, not one number alone.

export const DEFAULT_POLICY: PolicyConfig = {
  strongThreshold: 0.65,
  weakThreshold: 0.5,
  consecutiveForReplan: 2,
  consecutiveForHalt: 2,
  immediateHaltRegressionThreshold: 0.75,
};

export function validatePolicy(policy: PolicyConfig): PolicyConfig {
  const bounded = ["strongThreshold", "weakThreshold", "immediateHaltRegressionThreshold"] as const;
  for (const key of bounded) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0 || policy[key] > 1) {
      throw new RangeError(`${key} must be a finite number between 0 and 1`);
    }
  }
  if (policy.weakThreshold >= policy.strongThreshold) {
    throw new RangeError("weakThreshold must be less than strongThreshold");
  }
  for (const key of ["consecutiveForReplan", "consecutiveForHalt"] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1) {
      throw new RangeError(`${key} must be a positive integer`);
    }
  }
  return policy;
}

export interface SingleCheckDecision {
  decision: Decision;
  reasonCode: ReasonCode;
  confidence: number;
}

// assumptionContradicted and holisticStalled are the two signals that actually
// separate stagnation from progress (see experiments/results). materialProgress,
// strategyNovelty, and newUsefulEvidence corroborate or veto a call the primary
// signals already made -- they don't vote on their own.

function primaryStagnationStrength(s: SemanticSignals): number {
  return Math.max(s.assumptionContradicted, s.holisticStalled);
}

// materialProgress is a veto only, never a standalone trigger: it can lag a genuinely
// successful step when the preceding steps were stagnant. See README.
function hasRealMovement(s: SemanticSignals, p: PolicyConfig): boolean {
  return s.materialProgress >= p.weakThreshold;
}

function isCorroborated(s: SemanticSignals, p: PolicyConfig): boolean {
  const lowStrong = 1 - p.strongThreshold;
  return (
    s.strategyNovelty <= lowStrong ||
    s.newUsefulEvidence <= lowStrong ||
    (s.holisticStalled >= p.strongThreshold && s.assumptionContradicted >= p.weakThreshold) ||
    (s.assumptionContradicted >= p.strongThreshold && s.holisticStalled >= p.weakThreshold)
  );
}

/**
 * Decide from a single check's signals alone, with no history. Can return CONTINUE,
 * WARN, or REPLAN (when the primary stagnation signals are strong AND corroborated by
 * a secondary signal within this one check), or HALT -- but only for a strong,
 * confident regression signal, never for an uncertain one.
 */
export function decideSingleCheck(signals: SemanticSignals, policy: PolicyConfig = DEFAULT_POLICY): SingleCheckDecision {
  // Strong, confident regression bypasses hysteresis -- this is not "a single uncertain
  // judgment," it's the one signal the policy treats as self-sufficient by design.
  if (signals.regression >= policy.immediateHaltRegressionThreshold) {
    return { decision: "HALT", reasonCode: "REGRESSION_DETECTED", confidence: signals.regression };
  }

  const primary = primaryStagnationStrength(signals);
  const movement = hasRealMovement(signals, policy);

  if (primary >= policy.strongThreshold && !movement) {
    const reasonCode = signals.assumptionContradicted >= policy.weakThreshold ? "CONTRADICTED_ASSUMPTION_PERSISTS" : "REPEATED_STAGNATION";
    if (isCorroborated(signals, policy)) {
      return { decision: "REPLAN", reasonCode, confidence: primary };
    }
    return { decision: "WARN", reasonCode: "FIRST_STAGNATION_SIGNAL", confidence: primary };
  }

  if (primary >= policy.weakThreshold && !movement) {
    return { decision: "WARN", reasonCode: "FIRST_STAGNATION_SIGNAL", confidence: primary };
  }

  const strongProgress = Math.max(signals.materialProgress, signals.newUsefulEvidence, signals.strategyNovelty);
  if (strongProgress >= policy.strongThreshold) {
    return { decision: "CONTINUE", reasonCode: "STRONG_PROGRESS", confidence: strongProgress };
  }
  if (strongProgress >= policy.weakThreshold) {
    return { decision: "CONTINUE", reasonCode: "WEAK_PROGRESS", confidence: strongProgress };
  }

  return { decision: "CONTINUE", reasonCode: "NO_STRONG_SIGNAL", confidence: 1 - primary };
}

export interface RunState {
  consecutiveStagnation: number;
}

export function initialRunState(): RunState {
  return { consecutiveStagnation: 0 };
}

/** Applies cross-check hysteresis on top of a single check's raw decision. Mutates `state`. */
export function applyRunHysteresis(raw: SingleCheckDecision, state: RunState, policy: PolicyConfig = DEFAULT_POLICY): SingleCheckDecision {
  if (raw.decision === "HALT") {
    state.consecutiveStagnation = 0;
    return raw;
  }

  if (raw.decision === "CONTINUE") {
    state.consecutiveStagnation = 0;
    return raw;
  }

  // raw is WARN or REPLAN
  state.consecutiveStagnation += 1;

  if (state.consecutiveStagnation >= policy.consecutiveForReplan + policy.consecutiveForHalt) {
    return { decision: "HALT", reasonCode: "PERSISTENT_STAGNATION", confidence: raw.confidence };
  }

  if (state.consecutiveStagnation >= policy.consecutiveForReplan && raw.decision === "WARN") {
    return { decision: "REPLAN", reasonCode: "REPEATED_STAGNATION", confidence: raw.confidence };
  }

  return raw;
}
