import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ProgressGate, type ProgressGateInternalOverrides } from "../src/sdk/client.js";
import type { ProgressGateOptions, SemanticSignals, Step } from "../src/sdk/types.js";
import type { JevResponse } from "../src/sdk/jev.js";

/** TypeSafeClient requires an apiKey at construction time even when fetchSignals is
 * overridden for tests (no real network call is ever made), so default one in here. */
function makeGate(options: ProgressGateOptions = {}, internal: ProgressGateInternalOverrides = {}) {
  return new ProgressGate({ apiKey: "test-key", ...options }, internal);
}

function signals(overrides: Partial<SemanticSignals>): SemanticSignals {
  return {
    assumptionContradicted: 0,
    strategyNovelty: 0,
    materialProgress: 0,
    newUsefulEvidence: 0,
    regression: 0,
    holisticStalled: 0,
    ...overrides,
  };
}

function jevResult(s: SemanticSignals): JevResponse {
  return { signals: s, usage: { inputTokens: 10, outputTokens: 5 }, latencyMs: 1 };
}

/** A fetchSignals stand-in that returns queued responses in order; errors reject. */
function queueFetcher(queue: (SemanticSignals | Error)[]) {
  let i = 0;
  return async () => {
    const next = queue[i++];
    if (next instanceof Error) throw next;
    return jevResult(next);
  };
}

const STEP: Step = { action: "did a thing", result: "something happened" };

const PROGRESS_SIGNALS = signals({ materialProgress: 0.8, newUsefulEvidence: 0.85, strategyNovelty: 0.4 });
const BUSYWORK_SIGNALS = signals({ assumptionContradicted: 0.7, holisticStalled: 0.85, strategyNovelty: 0.2, materialProgress: 0.1 });
const REGRESSION_SIGNALS = signals({ regression: 0.9 });
const UNCERTAIN_SIGNALS = signals({ assumptionContradicted: 0.5, holisticStalled: 0.5, materialProgress: 0.3, newUsefulEvidence: 0.3, strategyNovelty: 0.3 });

describe("productive exploration", () => {
  test("stays CONTINUE across repeated checks", async () => {
    const gate = makeGate({}, { fetchSignals: queueFetcher([PROGRESS_SIGNALS, PROGRESS_SIGNALS, PROGRESS_SIGNALS, PROGRESS_SIGNALS]) });
    const run = gate.run({ goal: "ship the feature" });
    for (let i = 0; i < 4; i++) {
      const result = await run.observe(STEP);
      assert.equal(result.decision, "CONTINUE");
      assert.equal(result.consecutiveStagnation, 0);
    }
  });
});

describe("semantic busywork", () => {
  test("persistent busywork escalates to HALT when allowAutomaticHalt is true", async () => {
    const gate = makeGate(
      { allowAutomaticHalt: true },
      { fetchSignals: queueFetcher([BUSYWORK_SIGNALS, BUSYWORK_SIGNALS, BUSYWORK_SIGNALS, BUSYWORK_SIGNALS, BUSYWORK_SIGNALS]) },
    );
    const run = gate.run({ goal: "fix the deploy" });
    const decisions: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await run.observe(STEP);
      decisions.push(result.decision);
    }
    assert.ok(decisions.includes("HALT"), `expected an eventual HALT, got: ${decisions.join(",")}`);
  });

  test("counter resets to 0 after a CONTINUE", async () => {
    const gate = makeGate({}, { fetchSignals: queueFetcher([BUSYWORK_SIGNALS, PROGRESS_SIGNALS]) });
    const run = gate.run({ goal: "fix the deploy" });
    const first = await run.observe(STEP);
    assert.ok(first.consecutiveStagnation >= 1);
    const second = await run.observe(STEP);
    assert.equal(second.decision, "CONTINUE");
    assert.equal(second.consecutiveStagnation, 0);
  });

  test("reset clears the trajectory sent to the next observation", async () => {
    const observedRecentSteps: Step[][] = [];
    const gate = makeGate({}, {
      fetchSignals: async (_client, input) => {
        observedRecentSteps.push([...input.recentSteps]);
        return jevResult(BUSYWORK_SIGNALS);
      },
    });
    const run = gate.run({ goal: "fix the deploy" });

    await run.observe({ action: "first attempt", result: "permission denied" });
    run.reset();
    await run.observe({ action: "fresh attempt", result: "checked the new account" });

    assert.equal(observedRecentSteps[0].length, 0);
    assert.equal(observedRecentSteps[1].length, 0);
  });

  test("serializes concurrent observations in call order", async () => {
    const observedRecentSteps: Step[][] = [];
    let releaseFirst!: () => void;
    const firstCall = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    const gate = makeGate({}, {
      fetchSignals: async (_client, input) => {
        observedRecentSteps.push([...input.recentSteps]);
        calls += 1;
        if (calls === 1) await firstCall;
        return jevResult(PROGRESS_SIGNALS);
      },
    });
    const run = gate.run({ goal: "ship the feature" });
    const first = run.observe({ action: "one", result: "done" });
    const second = run.observe({ action: "two", result: "done" });
    await Promise.resolve();
    assert.equal(observedRecentSteps.length, 1);
    releaseFirst();
    await Promise.all([first, second]);

    assert.equal(observedRecentSteps.length, 2);
    assert.equal(observedRecentSteps[1][0].action, "one");
  });
});

describe("input and policy validation", () => {
  test("stateless checks cap recent history at eight steps", async () => {
    let receivedLength = 0;
    const gate = makeGate({}, {
      fetchSignals: async (_client, input) => {
        receivedLength = input.recentSteps.length;
        return jevResult(PROGRESS_SIGNALS);
      },
    });
    const recentSteps = Array.from({ length: 12 }, (_, i) => ({ action: `a${i}`, result: `r${i}` }));
    await gate.check({ goal: "g", recentSteps, latestStep: STEP });
    assert.equal(receivedLength, 8);
  });

  test("rejects invalid policy thresholds", () => {
    assert.throws(() => makeGate({ policy: { weakThreshold: 0.8, strongThreshold: 0.7 } }), /weakThreshold/);
  });
});

describe("uncertain single results", () => {
  test("a single uncertain check never HALTs", async () => {
    const gate = makeGate({ allowAutomaticHalt: true }, { fetchSignals: queueFetcher([UNCERTAIN_SIGNALS]) });
    const result = await gate.check({ goal: "g", recentSteps: [], latestStep: STEP });
    assert.notEqual(result.decision, "HALT");
  });
});

describe("fail-open behavior", () => {
  test("a Jev failure defaults to CONTINUE with SUPERVISOR_UNAVAILABLE", async () => {
    const gate = makeGate({}, { fetchSignals: queueFetcher([new Error("network down")]) });
    const result = await gate.check({ goal: "g", recentSteps: [], latestStep: STEP });
    assert.equal(result.decision, "CONTINUE");
    assert.equal(result.reasonCode, "SUPERVISOR_UNAVAILABLE");
    assert.equal(result.confidence, 0);
    assert.ok(result.error);
  });

  test("onError: 'throw' propagates the error instead", async () => {
    const gate = makeGate({ onError: "throw" }, { fetchSignals: queueFetcher([new Error("network down")]) });
    await assert.rejects(() => gate.check({ goal: "g", recentSteps: [], latestStep: STEP }));
  });

  test("a Jev failure does not advance stagnation hysteresis", async () => {
    const gate = makeGate({}, { fetchSignals: queueFetcher([BUSYWORK_SIGNALS, new Error("timeout")]) });
    const run = gate.run({ goal: "fix the deploy" });
    const first = await run.observe(STEP);
    const consecutiveAfterFirst = first.consecutiveStagnation;
    assert.ok(consecutiveAfterFirst >= 1);

    const second = await run.observe(STEP);
    assert.equal(second.decision, "CONTINUE");
    assert.equal(second.reasonCode, "SUPERVISOR_UNAVAILABLE");
    assert.equal(second.consecutiveStagnation, consecutiveAfterFirst, "hysteresis counter must not move on a supervisor failure");
  });
});

describe("allowAutomaticHalt safety gate", () => {
  test("default (false) converts HALT into REPLAN + recommendedDecision HALT", async () => {
    const gate = makeGate({}, { fetchSignals: queueFetcher([REGRESSION_SIGNALS]) });
    const result = await gate.check({ goal: "g", recentSteps: [], latestStep: STEP });
    assert.equal(result.decision, "REPLAN");
    assert.equal(result.recommendedDecision, "HALT");
  });

  test("allowAutomaticHalt: true preserves the real HALT", async () => {
    const gate = makeGate({ allowAutomaticHalt: true }, { fetchSignals: queueFetcher([REGRESSION_SIGNALS]) });
    const result = await gate.check({ goal: "g", recentSteps: [], latestStep: STEP });
    assert.equal(result.decision, "HALT");
    assert.equal(result.recommendedDecision, undefined);
  });
});

describe("secret hygiene", () => {
  test("the API key never appears in a serialized error result", async () => {
    const secretKey = "sk-live-supersecret-1234567890";
    const gate = makeGate(
      { apiKey: secretKey },
      { fetchSignals: queueFetcher([new Error(`request failed: Authorization Bearer ${secretKey} was rejected`)]) },
    );
    const result = await gate.check({ goal: "g", recentSteps: [], latestStep: STEP });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(secretKey), "serialized result must not contain the API key");
    assert.ok(result.error?.message.includes("[REDACTED]"));
  });
});
