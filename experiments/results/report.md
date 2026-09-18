# ProgressGate Jev Evaluation

Run at 2026-09-18T04:33:34.177Z. 53 fixtures, 53 answered, 0 errors. Total wall time 9.8s.

## Agreement

- Obvious cases: 13/19 (68.4%)
- Borderline cases: 21/34 (61.8%)
- Overall: 34/53 (64.2%)

## Confusion matrix (rows = expected, cols = actual)

```
expected\actual | PROGRESSING | STALLED | REGRESSING | COMPLETE
PROGRESSING | 7 | 1 | 0 | 12
STALLED | 6 | 18 | 0 | 0
REGRESSING | 0 | 0 | 5 | 0
COMPLETE | 0 | 0 | 0 | 4
```

## False STALLED (dangerous: would interrupt real progress)

- retry-03: expected PROGRESSING, got STALLED

## False PROGRESSING (dangerous: fails to catch stagnation)

- assume-05: expected STALLED, got PROGRESSING
- premature-01: expected STALLED, got PROGRESSING
- premature-02: expected STALLED, got PROGRESSING
- premature-03: expected STALLED, got PROGRESSING
- extra-01: expected STALLED, got PROGRESSING
- extra-04: expected STALLED, got PROGRESSING

## Missed regressions

none

## Latency (ms)

min 92 | p50 161 | p90 256 | max 636 | mean 185

## Errors

none
