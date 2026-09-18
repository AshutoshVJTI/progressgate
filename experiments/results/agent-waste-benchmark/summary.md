# ProgressGate agent waste reduction benchmark

Generated: 2026-09-18T07:30:52.595Z
Model: claude-haiku-4-5-20251001
ProgressGate package version: 0.1.0
Max steps: 12
Runs: 80 total (20 stuck + 20 healthy, each run twice)

## Headline measurements

- Stuck model calls: 115 without gate vs 80 with gate (35 avoided, 30.4% reduction).
- Stuck tokens: 151731 without gate vs 104923 with gate (46808 avoided, 30.8% reduction).
- Steps prevented on gated stuck runs that halted: average 0.80, median 0, maximum 8.
- Max-step loops: 1/20 without gate vs 0/20 with gate.
- Healthy false-HALT rate: 0/20 (0.0%).

## Before / after

| Cohort | Metric | Without ProgressGate | With ProgressGate |
|---|---|---:|---:|
| Stuck | Model calls | 115 | 80 |
| Stuck | Average steps | 4.80 | 4.00 |
| Stuck | Tokens | 151731 | 104923 |
| Stuck | Max-step loops | 1/20 | 0/20 |
| Healthy | Successful runs | 20/20 | 20/20 |
| Healthy | False HALTs | — | 0/20 |

## Largest reduction observed

Scenario stuck-environment-1:

- Without ProgressGate: 12 model calls, 19939 tokens, 12 steps, max_steps.
- With ProgressGate: 4 model calls, 5064 tokens, 4 steps, gate_halt at step 4.
- Result: 8 model calls and 14875 tokens avoided.


## Projection

Linear projection from this 20-run stuck test set, not measured production usage. At this measured rate: 1750 model calls and 2340400 tokens avoided per 1,000 similarly stuck runs.

## Caveats

This is a 40-scenario end-to-end test set using one model, one max-step setting, deterministic simulated tools, and live model plus Jev calls. It measures this harness, not production usage, model quality, latency, or dollar savings. The healthy cohort is the safety baseline; any false HALT or completion loss must be reported with the waste reductions.
