import type { ProgressCheckInput } from "./types.js";

// The category set for the follow-up adversarial evaluation. Distinct from AgentState
// (PROGRESSING/STALLED/REGRESSING/COMPLETE) used in the first evaluation -- this one
// specifically isolates the failure mode found there: different-looking actions that
// still depend on the same falsified assumption, and unverified success claims.
export type AdversarialCategory =
  | "PRODUCTIVE_EXPLORATION"
  | "SEMANTIC_BUSYWORK"
  | "UNVERIFIED_SUCCESS"
  | "VERIFIED_SUCCESS";

// A design's deterministic policy may also output UNCERTAIN when its atomic signals
// don't clearly resolve. UNCERTAIN is always scored as a miss (never a lucky match)
// since none of the fixtures are labeled UNCERTAIN.
export type DesignOutput = AdversarialCategory | "UNCERTAIN";

export interface AdversarialFixture {
  id: string;
  category: AdversarialCategory;
  /** Fixtures constructed as a matched pair differing in exactly one governing fact share a pairId. */
  pairId?: string;
  notes: string;
  input: ProgressCheckInput;
}

export type DesignName = "A" | "B" | "C";

export interface DesignRunResult {
  design: DesignName;
  fixtureId: string;
  expected: AdversarialCategory;
  predicted: DesignOutput;
  correct: boolean;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  signals: Record<string, number | string>;
  error?: string;
}
