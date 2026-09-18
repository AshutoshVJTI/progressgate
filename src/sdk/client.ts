import { TypeSafeClient } from "@typesafe-ai/sdk";
import { fetchSignals as defaultFetchSignals, type JevResponse } from "./jev.js";
import { DEFAULT_POLICY, applyRunHysteresis, decideSingleCheck, initialRunState, type SingleCheckDecision } from "./policy.js";
import type {
  CheckInput,
  Decision,
  GateResult,
  PolicyConfig,
  ProgressGateOptions,
  ProgressGateRun,
  RunObserveResult,
  Step,
} from "./types.js";

type FetchSignals = (client: TypeSafeClient, input: CheckInput) => Promise<JevResponse>;

/** @internal test-only hook -- not part of the public API, not exported from index.ts. */
export interface ProgressGateInternalOverrides {
  fetchSignals?: FetchSignals;
}

const NEUTRAL_SIGNALS = {
  assumptionContradicted: 0,
  strategyNovelty: 0,
  materialProgress: 0,
  newUsefulEvidence: 0,
  regression: 0,
  holisticStalled: 0,
};

function explain(decision: Decision, reasonCode: string, signals: Record<string, number>): string {
  const parts = Object.entries(signals)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`)
    .join(", ");
  return `${decision} (${reasonCode}) from [${parts}]`;
}

/** Strips a known secret value out of arbitrary text before it's ever put on a result or logged. */
function redact(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join("[REDACTED]");
}

function toSanitizedError(err: unknown, apiKey: string | undefined): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name, message: redact(err.message, apiKey) };
  }
  return { name: "UnknownError", message: redact(String(err), apiKey) };
}

/** Downgrades HALT to REPLAN unless allowAutomaticHalt is set. */
function applyHaltSafety(
  decision: SingleCheckDecision,
  allowAutomaticHalt: boolean,
): SingleCheckDecision & { recommendedDecision?: Decision } {
  if (decision.decision === "HALT" && !allowAutomaticHalt) {
    return { decision: "REPLAN", reasonCode: decision.reasonCode, confidence: decision.confidence, recommendedDecision: "HALT" };
  }
  return decision;
}

export class ProgressGate {
  private readonly client: TypeSafeClient;
  private readonly policy: PolicyConfig;
  private readonly onError: "continue" | "throw";
  private readonly allowAutomaticHalt: boolean;
  private readonly apiKey: string | undefined;
  private readonly fetchSignals: FetchSignals;

  constructor(options: ProgressGateOptions = {}, internal: ProgressGateInternalOverrides = {}) {
    this.apiKey = options.apiKey;
    this.client = new TypeSafeClient(options.apiKey ? { apiKey: options.apiKey } : {});
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.onError = options.onError ?? "continue";
    this.allowAutomaticHalt = options.allowAutomaticHalt ?? false;
    this.fetchSignals = internal.fetchSignals ?? defaultFetchSignals;
  }

  /** Stateless single check. Does not remember prior calls -- use `run()` to track a circuit across a loop. */
  async check(input: CheckInput): Promise<GateResult> {
    const started = Date.now();
    let jev: JevResponse;
    try {
      jev = await this.fetchSignals(this.client, input);
    } catch (err) {
      if (this.onError === "throw") throw err;
      return this.supervisorUnavailableResult(err, Date.now() - started);
    }

    const raw = decideSingleCheck(jev.signals, this.policy);
    const gated = applyHaltSafety(raw, this.allowAutomaticHalt);
    return {
      decision: gated.decision,
      confidence: gated.confidence,
      reasonCode: gated.reasonCode,
      recommendedDecision: gated.recommendedDecision,
      signals: jev.signals,
      debugExplanation: explain(gated.decision, gated.reasonCode, jev.signals as unknown as Record<string, number>),
      latencyMs: jev.latencyMs,
      usage: jev.usage,
    };
  }

  private supervisorUnavailableResult(err: unknown, latencyMs: number): GateResult {
    return {
      decision: "CONTINUE",
      confidence: 0,
      reasonCode: "SUPERVISOR_UNAVAILABLE",
      signals: { ...NEUTRAL_SIGNALS },
      debugExplanation: "CONTINUE (SUPERVISOR_UNAVAILABLE) -- Jev call failed, failing open",
      latencyMs,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: toSanitizedError(err, this.apiKey),
    };
  }

  /** Starts a stateful run that applies cross-check hysteresis (consecutive WARN/REPLAN escalation). */
  run(opts: { goal: string; authoritativeState?: string }): ProgressGateRun {
    const gate = this;
    const policy = this.policy;
    const state = initialRunState();
    const recentSteps: Step[] = [];
    let lastDecision: Decision | null = null;

    return {
      goal: opts.goal,
      get lastDecision() {
        return lastDecision;
      },
      reset() {
        state.consecutiveStagnation = 0;
        lastDecision = null;
      },
      async observe(step, stepOpts): Promise<RunObserveResult> {
        const started = Date.now();
        let jev: JevResponse;
        try {
          jev = await gate.fetchSignals(gate.client, {
            goal: opts.goal,
            authoritativeState: stepOpts?.authoritativeState ?? opts.authoritativeState,
            recentSteps,
            latestStep: step,
          });
        } catch (err) {
          recentSteps.push(step);
          if (recentSteps.length > 8) recentSteps.shift();

          if (gate.onError === "throw") throw err;

          // Fail open WITHOUT touching hysteresis: a supervisor outage must never look
          // like, or count toward, agent stagnation.
          const result: RunObserveResult = {
            ...gate.supervisorUnavailableResult(err, Date.now() - started),
            consecutiveStagnation: state.consecutiveStagnation,
          };
          lastDecision = result.decision;
          return result;
        }

        const raw = decideSingleCheck(jev.signals, policy);
        const effective = applyRunHysteresis(raw, state, policy);
        const gated = applyHaltSafety(effective, gate.allowAutomaticHalt);

        recentSteps.push(step);
        if (recentSteps.length > 8) recentSteps.shift();
        lastDecision = gated.decision;

        return {
          decision: gated.decision,
          confidence: gated.confidence,
          reasonCode: gated.reasonCode,
          recommendedDecision: gated.recommendedDecision,
          signals: jev.signals,
          debugExplanation: explain(gated.decision, gated.reasonCode, jev.signals as unknown as Record<string, number>),
          latencyMs: jev.latencyMs,
          usage: jev.usage,
          consecutiveStagnation: state.consecutiveStagnation,
        };
      },
    };
  }
}
