---
doc_id: tracking-redesign
title: Tracking Redesign
category: design
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - tracking_design
canonical_for:
  - tracking_design
depends_on:
  - live-data-research-2026-03-07
  - heuristics-research-2026-03-09
  - session-analysis-2026-03-10
supersedes: []
superseded_by: []
---

# Tracking Redesign

## Problem statement

The app currently synthesizes bus positions from stop ETAs by projecting the vehicle onto the full route polyline. That approach is too coarse and produces incorrect placement because it ignores route stop order and direction.

## Research summary

Research performed against the live Ingenia API on March 7, 2026:

- `/Lines` for `IdGroup = 13` returns 3 lines.
- Each line contains:
  - top-level `EncodedPath`
  - `Directions[0].stops`: ordered stop sequence for that route
  - duplicated `ePathLine` under the direction object
- `/Stations` returns 32 stops in a flat catalog.
- `/ArrivalTime` queried across all 32 stops currently exposes 1 active bus: `IdBus = 306`.
- That single bus appears in 22 stop responses with increasing `Minutes`.
- The predicted stops align with the ordered stop list of `L.1 LEIOA`, including cyclic wrap at the end of the route.

## Important conclusions

1. The arrival API is bus-centric, not stop-centric, once aggregated across the network.
2. The line's ordered stop sequence is the authoritative source for travel direction.
3. The map should not estimate position relative to the full route length.
4. The route label used in the UI should come from line metadata, not `ArrivalTime.LName`.

## Proposed model

For each active bus:

1. Aggregate all `ArrivalTime` entries across stops.
2. Group them by `IdBus`.
3. Sort each bus group by ETA ascending.
4. Use the first entry as the next target stop.
5. Resolve that stop inside the ordered stop list for the line.
6. Infer the previous stop as the preceding stop in that ordered sequence.
7. Interpolate position only on the route segment between previous stop and next stop.
8. Use subsequent ETA entries to estimate segment duration rather than relying on a fixed route-wide speed.

## Data/model changes required

### API normalization

Update the normalized `Line` model to include ordered stops from `/Lines`.

Suggested shape:

```ts
interface LineStop {
  id: string
  name: string
  lat: number
  lng: number
  sequence: number
}

interface Line {
  ref: string
  name: string
  encodedPath: string
  stops: LineStop[]
}
```

### Tracking state

Track buses against route segments, not just target stops.

Suggested additions:

```ts
interface BusSegmentPosition {
  busId: string
  lineRef: string
  previousStopId: string
  nextStopId: string
  minutesToNextStop: number
  estimatedSegmentMinutes: number
}
```

## Implementation plan

## Status

- Phase 1 completed: normalized line stops are now included in the line model.
- Phase 2 partially completed: the tracker now resolves `previous stop -> next stop` from the ordered route stop list before placing the bus.
- Diagnostics and confidence-scored marker rendering have been added.
- Confidence is now split into route continuity, ETA stability, and plateau risk components.
- Sustained low-ETA plateaus can now be classified as ghost states instead of only degrading marker confidence.
- Snapshot-level context now includes terminal-hotspot priors and same-line same-stop overlap penalties.
- Cold-start handling now uses explicit `moving`, `holding`, and `ambiguous` render states.
- Startup bootstrap polls now run at `0s`, `5s`, and `10s`, and local drift is disabled until a confirming second snapshot arrives.
- Remaining work: tune the component weights against more live sessions and formalize the suppression model.

The latest 5-minute live-capture findings are documented separately in [docs/live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md).
Cross-session replay-based heuristic tuning is documented in [docs/heuristics-research-2026-03-09.md](./heuristics-research-2026-03-09.md).

### Phase 1: domain and normalization

1. Extend [src/types/transit.ts](../src/types/transit.ts) with ordered line stop types.
2. Update [src/services/api.ts](../src/services/api.ts) to normalize `Directions[0].stops`.
3. Stop using arrival `lineName` as the display source of truth.

### Phase 2: route-aware tracking

1. Build a `lineRef -> ordered stops` lookup.
2. For each grouped bus, map the nearest ETA stop into that ordered list.
3. Resolve previous/next stop pairs with cyclic wrap support.
4. Remove the current whole-line distance heuristic.

### Phase 3: segment interpolation

1. Add a geometry helper that cuts the route polyline between two adjacent ordered stops.
2. Interpolate on that segment only.
3. Estimate segment progress from:
   - `minutesToNextStop`
   - the ETA difference to the following stop when available
4. Fall back to a conservative speed heuristic only when segment timing is missing.

### Phase 4: validation and debugging

1. Add logging/diagnostics for:
   - chosen line
   - previous stop
   - next stop
   - segment duration
   - segment progress ratio
2. Add unit tests for stop-sequence matching and segment-resolution logic.
3. Verify placement manually against multiple live snapshots.

## Known risks

- Some lines may have repeated physical stop coordinates or shared stops across directions.
- Some API responses may omit intermediate stops for a bus snapshot.
- Route polylines may not pass exactly through stop coordinates, so stop snapping to line geometry still matters.
- Weekend `L.UNICA` may require separate handling because it merges portions of multiple weekday patterns.

## Acceptance criteria

- Active buses are placed on the correct route segment, not elsewhere on the line.
- The app can distinguish buses traveling in different directions on shared physical roads.
- A bus with only one active ETA still lands on a plausible adjacent segment.
- UI labels show the real line name and next stop consistently.
