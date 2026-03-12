---
doc_id: session-analysis-2026-03-10
title: Session Analysis - March 10, 2026 (Completed)
category: research
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - session_analysis
  - operational_patterns
canonical_for:
  - current_empirical_state
  - overnight_behavior
  - morning_ramp_up
depends_on:
  - capture-pipeline
  - session-analysis-2026-03-09
supersedes:
  - session-analysis-2026-03-08
  - session-analysis-2026-03-09
superseded_by: []
---

# Session Analysis - March 10, 2026

## Dataset

- Session: `session-2026-03-09T07-11-51-345Z`
- Status: `stopped` (Fully Completed Capture)
- Capture window:
  - first snapshot: `2026-03-09T07:11:51.610Z`
  - last snapshot analyzed: `2026-03-10T09:52:11.995Z`
  - local window: `2026-03-09 08:11:51` to `2026-03-10 10:52:11`
- Duration analyzed: `26.67` hours
- Snapshots analyzed: `5,156`
- Failed polls: `3`
- Total stop polls: `164,992`

## Executive summary

The fully completed overnight into morning capture materially strengthens the earlier conclusion: the public feed is not exposing clean per-vehicle GPS positions. It behaves like a stop-centric ETA system with strong terminal artifacts and occasional stale state persistence.

The single strongest result is the overnight and morning behavior of bus `308`:

- From late night `2026-03-09 23:05` local time through to the early morning ramp-up `2026-03-10 06:16` local time, the backend repeatedly exposed this active tracking key:
  - `308:L.1 LEIOA`
- Across multiple multi-hour segments (e.g. 7.5 hours continuously, then smaller 35-minute overnight chunks), that tracking key stayed at:
  - stop: `METRO LAMIAKO`
  - ETA range: `0-1`

That is not credible as raw live vehicle positioning, confirming the "ghost" terminal state hypothesis.

## Network-level findings

- Active bus count distribution across all `5,156` snapshots:
  - `0` active keys: `52`
  - `1` active key: `780`
  - `2` active keys: `236`
  - `3` active keys: `4,010`
  - `4` active keys: `78`
- Unique buses observed: `4`
  - `307:L.1 LEIOA`
  - `308:L.1 LEIOA`
  - `228:L.2 LEIOA`
  - `306:L.UNICA` (historically switches lines)

## Day vs night service profile

### Daytime (March 9)

From the morning of March 9, 2026 through late evening:

- the network is highly regular
- most snapshots show `3` active tracking keys
- that is usually:
  - `2` on `L.1 LEIOA`
  - `1` on `L.2 LEIOA`

### Late evening transition

- At `2026-03-09 22:00` local, average activity drops significantly.
- At `2026-03-09 23:00` local, average activity collapses to just `1` active key.

### Overnight

Overnight behavior is not just lower service. It is structurally different:

- `2026-03-10 00:00` through `2026-03-10 05:00` local:
  - average active keys per hour: `1.00`
  - only `L.1 LEIOA` appears
- the surviving overnight key is overwhelmingly:
  - `308:L.1 LEIOA`
  - nearest stop always `METRO LAMIAKO`
  - ETA always `0-1`

### Morning Ramp-Up (March 10)

The capture continued until almost 11:00 AM local time, verifying the service resumption:

- Around `06:46` to `06:59` local, `307:L.1 LEIOA` and `228:L.2 LEIOA` successfully resumed active route circulating patterns.
- Around `09:54` local (`08:54` UTC), `306:L.UNICA` came online.
- However, terminal holds persisted even in active morning service. `307` held at `METRO LAMIAKO` for over 35 minutes, and `228` held at `INDEPENDENTZIA` for over 13 minutes.

## Bus-level findings

### `308:L.1 LEIOA`

This remains the strongest ghost-bus candidate in the entire dataset.

- snapshots observed: `5,104`
- longest exact freeze:
  - `METRO LAMIAKO`, `1 min`
  - `117.86` minutes
- longest same-stop run:
  - `METRO LAMIAKO`
  - `453.95` minutes
  - ETA range `0-1`
- same-stop ETA delta distribution:
  - `4,662` zero-delta comparisons out of `4,911`

This tracking key is not usable as a literal moving-vehicle source without aggressive distrust.

### `307:L.1 LEIOA`

This remains the best `L.1` moving-service candidate, but it still shows severe terminal artifacts.

- snapshots observed: `4,110`
- unique nearest stops: `23/23`
- transitions: `417`
- route wraps observed: `23`
- longest same-stop run:
  - `METRO LAMIAKO`
  - `53.76` minutes
  - ETA range `0-1`

Interpretation:

- route progression is operationally real
- but long Lamiako plateaus still make naive live positioning unsafe

### `228:L.2 LEIOA`

This remains the cleanest route in the dataset.

- snapshots observed: `3,127`
- unique nearest stops: `16/16`
- transitions: `371`
- route wraps observed: `26`
- longest same-stop run:
  - `INDEPENDENTZIA (DIRECCION AMAIA)`
  - `14.91` minutes
  - ETA range `1-2`
- adjacent minute delta summary:
  - average `1.85`
  - median `2`
  - max `4`

Interpretation:

- `L.2` looks much healthier than `L.1`
- it is the best line for learning realistic segment timing priors

### `306:L.UNICA`

- snapshots observed: `1,253`
- unique nearest stops: `17`
- The bus successfully performed circulating routes on Line 2 / L.UNICA patterns but suffered a very long terminal hold (`42.65` minutes) at `INDEPENDENTZIA (DIRECCION AMAIA)`.

## Route-gap findings

Persistent route-sequence gaps remain present.

For `L.1`:

- the dominant gap is still:
  - `ALDEKOENA -> SARRIENA`
- counts:
  - `308`: `4,817`
  - `307`: `3,761`

Interpretation:

- some missing-stop structure is systematic in the backend output
- the tracker should continue treating route-order gaps as a confidence penalty, not as rare anomalies

## What this says about GPS vs ETA

The full multi-day capture is the clearest evidence so far:

1. The data is not a pure static timetable.
   - morning service ramps up at plausible times
   - multiple keys circulate during normal service
2. The data is also not raw continuous GPS telemetry.
   - a single `L.1` key can remain at one terminal stop for more than `7` hours
   - ETAs can remain locked at `0-1`
   - one bus can dominate the overnight feed while the rest of the network is absent

Best interpretation:

- this is a stop-centric ETA prediction system with some operational state
- it is not a trustworthy source of literal vehicle coordinates

## Implications for the tracker

The current tracker should evolve in these directions:

1. Add a stronger overnight prior.
   - a singleton `L.1` bus at `METRO LAMIAKO` between late night and service restart should start at very low confidence
2. Distinguish overnight singleton states from daytime circulating states.
   - the same heuristics should not be used uniformly across the full day
3. Learn segment priors mainly from `L.2` and from non-terminal `L.1` segments.
   - `L.2` is much cleaner
4. Treat long `0-1` terminal plateaus as "holding/stale" before considering them "moving", even during daytime active service.

## Bottom line

This completed overnight and morning session does not weaken the earlier model. It strengthens it.

- `L.2` still looks like the most reliable source for route progression and segment timing
- `L.1` still has severe terminal distortion at `METRO LAMIAKO`
- overnight singleton behavior makes the "not raw GPS" conclusion substantially stronger than before
