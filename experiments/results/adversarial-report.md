# ProgressGate Adversarial Evaluation (Designs A/B/C)

Run at 2026-09-18T04:46:44.089Z. 50 fixtures x 3 designs = 150 Jev calls. Total wall time 27.7s.

## Design A (baseline, unchanged 5-question formulation)

```
expected\predicted | PRODUCTIVE | BUSYWORK | UNVERIFIED | VERIFIED | UNCERTAIN
PRODUCTIVE | 14 | 0 | 0 | 1 | 0
BUSYWORK | 1 | 14 | 0 | 0 | 0
UNVERIFIED | 10 | 0 | 0 | 0 | 0
VERIFIED | 1 | 0 | 0 | 9 | 0
```

- PRODUCTIVE_EXPLORATION: 14/15 (93.3%)
- SEMANTIC_BUSYWORK: 14/15 (93.3%)
- UNVERIFIED_SUCCESS: 0/10 (0.0%)
- VERIFIED_SUCCESS: 9/10 (90.0%)

Overall: 37/50 (74.0%)

## Design B (evidence-first atomic judgments)

```
expected\predicted | PRODUCTIVE | BUSYWORK | UNVERIFIED | VERIFIED | UNCERTAIN
PRODUCTIVE | 12 | 0 | 1 | 1 | 1
BUSYWORK | 0 | 9 | 0 | 0 | 6
UNVERIFIED | 0 | 0 | 10 | 0 | 0
VERIFIED | 0 | 0 | 6 | 4 | 0
```

- PRODUCTIVE_EXPLORATION: 12/15 (80.0%)
- SEMANTIC_BUSYWORK: 9/15 (60.0%)
- UNVERIFIED_SUCCESS: 10/10 (100.0%)
- VERIFIED_SUCCESS: 4/10 (40.0%)

Overall: 35/50 (70.0%)

## Design C (hybrid: atomic + holistic state)

```
expected\predicted | PRODUCTIVE | BUSYWORK | UNVERIFIED | VERIFIED | UNCERTAIN
PRODUCTIVE | 13 | 0 | 1 | 1 | 0
BUSYWORK | 1 | 14 | 0 | 0 | 0
UNVERIFIED | 0 | 0 | 10 | 0 | 0
VERIFIED | 0 | 0 | 8 | 2 | 0
```

- PRODUCTIVE_EXPLORATION: 13/15 (86.7%)
- SEMANTIC_BUSYWORK: 14/15 (93.3%)
- UNVERIFIED_SUCCESS: 10/10 (100.0%)
- VERIFIED_SUCCESS: 2/10 (20.0%)

Overall: 39/50 (78.0%)

## Side-by-side

| metric | A | B | C |
|---|---|---|---|
| false-stop (productive -> busywork) | 0.0% (0/15) | 0.0% (0/15) | 0.0% (0/15) |
| busywork miss (busywork -> productive) | 6.7% (1/15) | 0.0% (0/15) | 6.7% (1/15) |
| unverified accepted as verified | 0.0% (0/10) | 0.0% (0/10) | 0.0% (0/10) |
| verified rejected | 10.0% (1/10) | 60.0% (6/10) | 80.0% (8/10) |
| overall accuracy | 74.0% | 70.0% | 78.0% |
| p50 latency (ms) | 168 | 170 | 169 |
| p90 latency (ms) | 259 | 248 | 298 |
| API errors | 0 | 0 | 0 |

## Best atomic signals (Design B) -- mean(productive) - mean(busywork), sorted by |gap|

- assumptionContradicted: gap -0.47 (productive mean 0.08, busywork mean 0.55)
- strategyNovelty: gap 0.36 (productive mean 0.67, busywork mean 0.31)
- successClaimed: gap 0.27 (productive mean 0.31, busywork mean 0.05)
- relevantStateChanged: gap 0.13 (productive mean 0.33, busywork mean 0.20)
- verifiedSuccess: gap 0.11 (productive mean 0.43, busywork mean 0.32)
- externalEvidence: gap 0.06 (productive mean 0.56, busywork mean 0.50)

## Best atomic signals (Design C) -- mean(productive) - mean(busywork), sorted by |gap|

- p_STALLED: gap -0.88 (productive mean 0.00, busywork mean 0.88)
- p_PROGRESSING: gap 0.82 (productive mean 0.93, busywork mean 0.12)
- progressing: gap 0.65 (productive mean 0.84, busywork mean 0.19)
- assumptionContradicted: gap -0.46 (productive mean 0.08, busywork mean 0.55)
- strategyNovelty: gap 0.36 (productive mean 0.68, busywork mean 0.31)
- successClaimed: gap 0.26 (productive mean 0.31, busywork mean 0.05)
- relevantStateChanged: gap 0.14 (productive mean 0.34, busywork mean 0.20)
- verifiedSuccess: gap 0.12 (productive mean 0.43, busywork mean 0.31)
- p_COMPLETE: gap 0.07 (productive mean 0.07, busywork mean 0.00)
- externalEvidence: gap 0.06 (productive mean 0.57, busywork mean 0.51)
- p_REGRESSING: gap 0.00 (productive mean 0.00, busywork mean 0.00)
