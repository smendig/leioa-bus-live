---
doc_id: live-data-research-2026-03-07
title: Live Data Research - March 7, 2026
category: research
status: historical
updated_at: 2026-03-10
read_priority: specialized
topics:
  - live_api_reverse_engineering
  - tracking_design
canonical_for:
  - initial_live_reverse_engineering
depends_on: []
supersedes: []
superseded_by:
  - session-analysis-2026-03-10
---

# Live Data Research - March 7, 2026

## Scope

This document summarizes the latest live API research performed against the Ingenia backend for Leioa on March 7, 2026.

The goal was to validate whether the current bus-positioning logic was wrong because of frontend heuristics, backend data quality, or both.

## Research workflow

Two kinds of live checks were performed:

1. Direct one-off API inspection of:
   - `/Lines`
   - `/Stations`
   - `/ArrivalTime`
2. Time-series capture using the local tooling added to this repo:
   - [scripts/capture-live-snapshots.mjs](../scripts/capture-live-snapshots.mjs)
   - [scripts/analyze-live-snapshots.mjs](../scripts/analyze-live-snapshots.mjs)

## Files produced

- Short smoke-test capture:
  - [captures/live-capture-2026-03-07T22-18-27.812Z.json](../captures/live-capture-2026-03-07T22-18-27.812Z.json)
- Main 5-minute capture:
  - [captures/live-capture-2026-03-07T22-20-12.053Z.json](../captures/live-capture-2026-03-07T22-20-12.053Z.json)

## Topology findings

The `/Lines` response provides the key structure needed for route-aware tracking.

- There are 3 lines for `IdGroup = 13`.
- Each line includes:
  - `EncodedPath`
  - `Directions[0].stops`
- `Directions[0].stops` is an ordered stop sequence and is the correct basis for direction-aware vehicle placement.

The `/Stations` response is useful as a global stop catalog, but not as the source of travel order.

## Arrival payload findings

The `/ArrivalTime` endpoint does not expose GPS telemetry.

Instead, when all stop responses are aggregated, the result behaves like a bus-centric future stop projection:

- the same `IdBus` appears in many stop queries
- `Minutes` increases as the stop gets farther ahead in the route sequence
- the ordered route stop list from `/Lines` matches that future stop sequence closely

This validates the route-order-based modeling approach.

## 5-minute capture summary

Main capture parameters:

- duration: 300 seconds
- interval: 15 seconds
- total snapshots: 20
- stops queried per snapshot: 32

Observed live state during that window:

- active bus count: 1
- visible bus id: `306`
- line: `L.1 LEIOA`

## Key behavioral finding

During the full 5-minute capture, the nearest predicted stop for bus `306` never changed.

- nearest stop: `METRO LAMIAKO`
- nearest line index: `1`
- nearest ETA: `1 min`
- duration of freeze: full 20 snapshots / 5 minutes

This is not compatible with a healthy live movement signal.

The backend kept reporting the bus at the same target stop with the same ETA bucket for the entire observation window.

## Important implication

This means the frontend problem is not only geometry.

Even with better interpolation, a tracker will still be wrong if it treats frozen backend predictions as valid live movement.

The main observed failure mode is:

- stale bus prediction
- same nearest stop
- same ETA
- repeated across many consecutive polls

## ETA structure findings

Across the full ordered future stop list for the bus:

- most adjacent stop-pair ETA deltas were in the `1-2 minute` range
- average adjacent ETA delta across adjacent stop pairs was about `1.65`

This supports using adjacent ETA differences as a segment-duration estimate.

However, the data also showed gaps.

## Route-order gap finding

In every snapshot, there was a persistent stop-order gap:

- from `ALDEKOENA`
- directly to `SARRIENA`

This means the future stop list can omit intermediate stops, even when the overall route order remains recognizable.

That has two consequences:

1. Segment estimation cannot assume the next predicted stop is always the immediately adjacent stop in the route definition.
2. Fallback timing heuristics must use nearby local adjacent ETA information rather than a naive global average.

## What changed in the app because of this research

### 1. Route-aware placement

The app now resolves:

- next predicted stop
- previous stop from ordered route sequence
- placement on the route segment between those stops

This replaced the earlier whole-line heuristic.

### 2. Local segment-duration estimation

The tracker now prefers nearby local adjacent ETA deltas instead of a route-wide average when the direct adjacent stop pair is missing.

### 3. Stale prediction suppression

The app now keeps short prediction history per bus and suppresses buses when:

- the same nearest stop repeats
- the same ETA repeats
- this persists across too many polls

This change is directly justified by the 5-minute frozen `1 min` observation.

## Conclusions

The latest research supports these conclusions:

1. The route-order model is correct.
2. The old whole-line interpolation model was wrong.
3. The backend can produce stale or ghost predictions that last several minutes.
4. Confidence and stale-detection logic are mandatory, not optional.
5. A precise-looking marker is worse than hiding a low-confidence bus.

## Recommended next work

1. Collect more 5-minute captures at different times of day to observe:
   - multiple concurrent buses
   - actual nearest-stop transitions
   - behavior on `L.2 LEIOA` and `L.UNICA`
2. Add confidence levels instead of only binary suppression.
3. Persist research summaries from future captures so timing behavior can be compared over time.
4. Add tests around:
   - segment resolution
   - stale prediction detection
   - route-order gap handling

## Related documents

- [docs/tracking-redesign.md](./tracking-redesign.md)
- [README.md](../README.md)
