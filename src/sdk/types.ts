// Public SDK types. ProgressGate supervises semantic stagnation/regression only --
// it never decides whether the user's task is complete. That stays with the
// customer's own tests, application state, or agent logic.

export interface Step {
  action: string;
  result: string;
}

export interface CheckInput {
  /** The original user/task objective. Unchanged across a run. */
  goal: string;
  /** Optional externally-established ground truth, distinct from anything the agent has claimed. */
  authoritativeState?: string;
  /** Last 3-8 prior actions and their results. */
  recentSteps: Step[];
  /** The newest action and result to evaluate. */
  latestStep: Step;
}

export type Decision = "CONTINUE" | "WARN" | "REPLAN" | "HALT";

// Structured, stable-across-versions reason codes. Do not rely on the human-readable
// explanation for programmatic branching -- use this instead.
export type ReasonCode =
  | "STRONG_PROGRESS"
  | "NO_STRONG_SIGNAL"
  | "WEAK_PROGRESS"
  | "FIRST_STAGNATION_SIGNAL"
  | "REPEATED_STAGNATION"
  | "CONTRADICTED_ASSUMPTION_PERSISTS"
  | "REGRESSION_DETECTED"
  | "PERSISTENT_STAGNATION"
  | "PERSISTENT_REGRESSION"
  | "SUPERVISOR_UNAVAILABLE";

export interface SemanticSignals {
  /** Is the latest action still relying on an assumption existing evidence already contradicted? */
  assumptionContradicted: number;
  /** Is the latest action testing a genuinely different underlying strategy, vs. a surface variation? */
  strategyNovelty: number;
  /** Did the latest step materially move the real task state toward the goal? */
  materialProgress: number;
  /** Did the step produce evidence that meaningfully changes what's known or what to do next? */
  newUsefulEvidence: number;
  /** Did the latest action undo, contradict, or move away from earlier progress? */
  regression: number;
  /** Direct holistic Jev judgment: is the agent semantically stalled? */
  holisticStalled: number;
}

export interface GateResult {
  decision: Decision;
  confidence: number;
  reasonCode: ReasonCode;
  signals: SemanticSignals;
  /** Only for development -- do not parse or branch on this in production code. */
  debugExplanation: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  /** What the policy actually concluded, when `allowAutomaticHalt` downgraded it to REPLAN. See README. */
  recommendedDecision?: Decision;
  /** Set when the Jev call failed. Sanitized -- never contains the API key. */
  error?: { name: string; message: string };
}

export interface ProgressGateOptions {
  apiKey?: string;
  policy?: Partial<PolicyConfig>;
  /** What to do when the Jev call fails. Default "continue": fail open (see README). */
  onError?: "continue" | "throw";
  /** Whether HALT can reach your code as HALT. Default false -- see README "Safe defaults". */
  allowAutomaticHalt?: boolean;
}

export interface PolicyConfig {
  /** noul >= this counts as a "strong" contradiction/regression/stalled signal. */
  strongThreshold: number;
  /** noul >= this (but below strongThreshold) counts as a "weak"/borderline signal -- the hysteresis margin band. */
  weakThreshold: number;
  /** Consecutive WARN-or-worse checks before escalating to REPLAN. */
  consecutiveForReplan: number;
  /** Consecutive REPLAN-or-worse checks (after the first REPLAN) before escalating to HALT. */
  consecutiveForHalt: number;
  /** A single check at or above this regression probability halts immediately, bypassing hysteresis. */
  immediateHaltRegressionThreshold: number;
}

export interface RunObserveResult extends GateResult {
  /** Consecutive WARN-or-worse checks so far in this run, after this observation. */
  consecutiveStagnation: number;
}

export interface ProgressGateRun {
  goal: string;
  /** Feed the newest step; returns the gate decision and updates internal circuit state. */
  observe(step: Step, opts?: { authoritativeState?: string }): Promise<RunObserveResult>;
  /** Current decision without making a new check. */
  readonly lastDecision: Decision | null;
  /** Reset all circuit state for this run (e.g. after a manual REPLAN was acted on). */
  reset(): void;
}
