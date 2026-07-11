# Tracking validation — July 2026

This report records the reproducible chronological validation of the tracking duration model.

## Dataset and split

- Session: `session-2026-04-29T23-29-34-544Z`
- Snapshots read: 339,223
- Clean forward transitions: 32,062
- Training: 10,868 transitions before `2026-06-01T00:00:00Z`
- Holdout: 21,194 transitions on or after the cutoff

Runs containing a ten-poll exact ETA freeze, discontinuities over 30 seconds, non-forward stop
changes, and durations over 15 minutes are excluded from duration fitting.

## Strict holdout result

| Training-only model       |         MAE | Median absolute error | P90 absolute error |
| ------------------------- | ----------: | --------------------: | -----------------: |
| Stop pair, lines combined |     24.38 s |               15.96 s |            52.65 s |
| Line and stop pair        | **22.56 s** |           **15.57 s** |        **47.49 s** |

Including the line reduces mean error by 7.5% and P90 error by 9.8% without using any holdout
observations. This supports keeping `lineRef` in every empirical segment key.

The configured table scores 21.78 s MAE on the same period, but it was derived using the full
capture and is therefore not a strict holdout result. It is reported by the tool as a consistency
check, not as evidence of generalization.

## Coverage decision

The configured priors cover 99.91% of holdout transitions. The only missing key is
`L.1 LEIOA:350->351`; it has just three pre-cutoff samples. The runtime fallback is retained instead
of promoting an unstable empirical prior.

## Reproduce

```bash
npm run tracking:validate -- \
  captures/sessions/session-2026-04-29T23-29-34-544Z \
  --cutoff=2026-06-01T00:00:00.000Z
```
