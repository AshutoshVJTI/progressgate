export type AgentState = "PROGRESSING" | "STALLED" | "REGRESSING" | "COMPLETE";

export interface Step {
  action: string;
  result: string;
}

export interface ProgressCheckInput {
  goal: string;
  currentState?: string;
  recentSteps: Step[];
  latestStep: Step;
}

export type FixtureCategory =
  | "meaningful-progress"
  | "exact-loop"
  | "same-assumption-different-actions"
  | "broad-research-no-signal"
  | "repeated-calls-different-args-no-change"
  | "productive-exploration"
  | "temporary-failure-retry"
  | "genuine-strategy-switch"
  | "premature-done-claim"
  | "successful-completion"
  | "regression"
  | "ambiguous-borderline";

export interface Fixture {
  id: string;
  category: FixtureCategory;
  obvious: boolean;
  expected: AgentState;
  notes: string;
  input: ProgressCheckInput;
}

export interface JevJudgment {
  advancedProbability: number;
  progressingProbability: number;
  repeatingProbability: number;
  newEvidenceProbability: number;
  state: AgentState;
  stateConfidence: number;
  stateProbabilities: Record<AgentState, number>;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export type CircuitState = "CLOSED" | "WARNING" | "REPLAN" | "OPEN" | "STOP_SUCCESS" | "STOP_REVIEW";

export interface CircuitPolicyConfig {
  stalledThreshold: number;
  regressingThreshold: number;
  completeThreshold: number;
  consecutiveStalledForReplan: number;
  consecutiveStalledForStop: number;
  /** Repetition alone only counts as a stalled signal when paired with low new-evidence probability. */
  repeatingThreshold: number;
  lowEvidenceThreshold: number;
}

export interface CircuitDecision {
  circuitState: CircuitState;
  action: "CONTINUE" | "REPLAN" | "STOP" | "STOP_SUCCESS" | "STOP_REVIEW";
  consecutiveStalled: number;
  reason: string;
}
