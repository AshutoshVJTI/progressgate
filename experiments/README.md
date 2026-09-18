# experiments

Evaluation code and raw results from building the policy in `src/sdk/`, not part of
the published package.

- `types.ts`, `jev-client.ts`, `fixtures.ts`, `evaluate.ts` -- the first evaluation:
  53 hand-labeled trajectories against a single holistic "state" judgment. This is the
  prototype that came before `src/sdk/` existed; `jev-client.ts` and `types.ts` are
  superseded by the real SDK, kept here because `evaluate.ts` still runs against them.
- `adversarial-*.ts`, `run-adversarial-eval.ts` -- the second evaluation: 50 fixtures
  built specifically to separate productive exploration from semantic busywork, tested
  against three different Jev judgment designs. `src/sdk/policy.ts` is built on what
  this found.
- `live-agent-test/` -- a real Claude tool-calling agent, gated live by the actual SDK,
  against a small simulated environment. Proof the policy works inside a real loop, not
  just on hand-written fixtures.
- `results/` -- raw output from all three.

Run with `npm run evaluate`, `npm run evaluate:adversarial`, `npm run live-agent-test`
(all need `TYPESAFE_API_KEY`; the live agent test also needs `ANTHROPIC_API_KEY`).
