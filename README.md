# ProgressGate

Stop paying agents to spin.

ProgressGate watches recent agent steps and looks for semantic stagnation: different
actions that are still pursuing the same contradicted assumption. It's a small
deterministic policy sitting on top of [TypeSafe Jev](https://typesafe.ai) semantic
judgments — Jev reads the trajectory, code decides what to do about it.

```bash
npm install progressgate
export TYPESAFE_API_KEY=...   # https://typesafe.ai
```

```ts
import { ProgressGate } from "progressgate";

const gate = new ProgressGate({ apiKey: process.env.TYPESAFE_API_KEY });
const run = gate.run({ goal: "Fix the failing deployment" });

for (const step of agentSteps) {
  const result = await run.observe(step); // { action, result }
  if (result.decision === "HALT") { stopAgent(); break; }
  if (result.decision === "REPLAN") injectFeedback(result.reasonCode);
  // CONTINUE / WARN -> proceed as normal
}
```

## The problem

A permission error, then `try sudo`, then a different path, then a different service
account. Four different actions, same wrong assumption the whole time. A step counter
can't see that — it just counts steps, so it either cuts off real investigations too
early or lets a spinning agent run to the limit anyway. ProgressGate asks whether the
underlying assumption changed, not how many actions were taken.

## Decisions

| Decision | Meaning |
|---|---|
| `CONTINUE` | Progress or new evidence, no contradiction or regression |
| `WARN` | First stagnation signal, or weak progress |
| `REPLAN` | Multiple signals agree: same rejected assumption, no material change |
| `HALT` | Stagnation persisted across checks, or a confident regression |

Every result also carries a `reasonCode` (stable, for branching in code), the six raw
Jev signals, a `confidence`, and a `debugExplanation` string for development only —
don't parse it.

## Safe defaults

`allowAutomaticHalt` defaults to **false**. A check that would resolve to `HALT`
instead comes back as `REPLAN`, with `recommendedDecision: "HALT"` set so you can see
what the policy actually concluded without anything being terminated. Start there, log
`recommendedDecision`, read the `signals` on the cases where it fires, and only flip
`allowAutomaticHalt: true` once you've looked at real trajectories from your own agent.

A Jev/network failure fails open by default (`onError: "continue"`) rather than
crashing or blocking the agent it's supervising:

```ts
{ decision: "CONTINUE", reasonCode: "SUPERVISOR_UNAVAILABLE", confidence: 0, error: { name, message } }
```

`error.message` is sanitized — your API key never appears in it. A failed check also
never advances the stagnation counter used for hysteresis, so an outage can't look
like agent stagnation. Set `onError: "throw"` to propagate the error instead.

`materialProgress` (one of the six signals) is used only as a veto on a stagnation
call, never as a standalone trigger. A live agent test found it can lag a genuinely
successful step when the steps right before it were stagnant — one recorded case
scored `materialProgress` 0.42 on a step whose result literally read "deploy
succeeded, `/health` returns 200." Don't read it alone as a success signal.

## How it works

```
agent trajectory -> Jev semantic signals -> deterministic policy -> decision
```

One Jev `systemOne` call per check returns six atomic signals: `assumptionContradicted`,
`strategyNovelty`, `materialProgress`, `newUsefulEvidence`, `regression`,
`holisticStalled`. The policy in `src/sdk/policy.ts` — not Jev — applies hysteresis
across consecutive checks and picks the decision. Jev never executes or blocks a tool
call itself.

## What it does NOT do

- Determine whether the task is complete. That's your own tests, application state,
  or agent logic — ProgressGate has no "done" signal.
- Replace permission systems.
- Replace retry/token budgets for transient infrastructure failures.
- Guarantee correctness of any kind.
- Execute or block a tool call directly.

## Experimental

v0.1. Validated against 53 hand-labeled trajectories, a 50-trajectory adversarial set
targeting busywork-vs-exploration confusion specifically, and a live Claude
tool-calling agent test gated in real time. Data in `experiments/results/`. No
production deployments yet. The thresholds in `src/sdk/policy.ts` are a starting
point — evaluate them on your own trajectories before trusting `allowAutomaticHalt:
true` unattended.

[GitHub](https://github.com/ashutoshvjti/progressgate) ·
[npm](https://www.npmjs.com/package/progressgate)

## Local development

```bash
npm install
npm run build          # dist/ + type declarations
npm test                # tests/*.test.ts, Jev calls are mocked, no network
npm pack --dry-run      # verify the publishable tarball
npm run quickstart      # examples/quickstart.ts against the real Jev API
npm run demo:build      # regenerate demo/data.json from live Jev calls
npm run demo             # http://localhost:4173
npm run landing          # http://localhost:4174
```
