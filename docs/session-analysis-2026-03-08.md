---
doc_id: session-analysis-2026-03-08
title: Session Analysis - March 8, 2026
category: research
status: historical
updated_at: 2026-03-10
read_priority: historical
topics:
  - session_analysis
canonical_for: []
depends_on:
  - capture-pipeline
supersedes: []
superseded_by:
  - session-analysis-2026-03-10
---

# Session Analysis - March 8, 2026

## Session analyzed

- Session id: `session-2026-03-08T08-40-15-378Z`
- Session directory: [captures/sessions/session-2026-03-08T08-40-15-378Z](../captures/sessions/session-2026-03-08T08-40-15-378Z)
- Started at: March 8, 2026 08:40:15 UTC
- Last capture at: March 8, 2026 15:23:37 UTC
- Poll interval: 15 seconds
- Completed snapshots: 1,422
- Failed polls: 0
- Total stop polls: 45,504

## High-level summary

This session is large enough to support real behavioral conclusions.

Main observations:

1. The backend was idle most of the time.
2. Only two bus ids appeared in the full session.
3. Bus `306` dominated the dataset and provides the main useful signal.
4. The route-order model remains valid.
5. The backend still produces long frozen ETA states and abrupt ETA jumps.

## Active bus distribution

Across 1,422 snapshots:

- 809 snapshots had `0` active buses
- 611 snapshots had `1` active bus
- 2 snapshots had `2` active buses

This means:

- the network was empty or reported empty in about 57% of the session
- most useful analysis comes from sparse windows with only one active vehicle

## Unique buses observed

### Bus `306`

- snapshots observed: 613
- first seen: March 8, 2026 10:12:30 UTC
- last seen: March 8, 2026 12:47:52 UTC
- reported line ref: `L.UNICA`

### Bus `308`

- snapshots observed: 2
- first seen: March 8, 2026 11:32:43 UTC
- last seen: March 8, 2026 11:32:58 UTC
- reported line ref: `L.UNICA`

The session is effectively a long study of bus `306`.

## Route progression quality

Bus `306` progressed through a long sequence of nearest stops that is broadly plausible and route-ordered:

- `METRO LAMIAKO`
- `TXOPOETA`
- `METRO LEIOA ( SENTIDO LEIOA)`
- `LIBANO (DIRECCION LEIOA)`
- `ITURRIBIDE`
- `IKEA`
- `DONIBANE SAN JUAN`
- `KULTUR LEIOA`
- `ALDEKOENA`
- `SARRIENA`
- `ARTATZAGANA`
- `SAN BARTOLOMÉ`
- `JOAQUIN ACHUCARRO`
- `BASAEZ`
- `ARTATZA`
- `TORRESOLO ( DIRECCION TXORIERRI)`
- `INDEPENDENTZIA ( DIRECCION TXORIERRI)`
- `TXORIERRI`
- `IPARRAGIRRE`
- `LIBANO(DIRECCION AMAIA)`
- `METRO LEIOA ( SENTIDO AMAIA ETORBIDEA)`
- `TXOPOETA ( DIRECCION AMAIA)`
- `METRO LAMIAKO (DIRECCION AMAIA)`
- `AREETA ANBULATORIOA`
- `BULEBARRA`

This confirms:

- route-order-based tracking is structurally correct
- the old whole-line interpolation approach should stay discarded

## Freeze behavior

The largest issue remains stale prediction behavior.

Longest exact frozen state observed for bus `306`:

- stop: `AREETA ANBULATORIOA`
- ETA: `5 min`
- duration: 50 snapshots
- time span: March 8, 2026 11:08:06 UTC to 11:20:32 UTC

At a 15-second polling interval, that is about 12 minutes and 30 seconds of a completely unchanged nearest-stop + ETA state.

Other long frozen states:

- `METRO LAMIAKO` at `2 min`: 41 snapshots, about 10 minutes
- `SAN BARTOLOMÉ` at `3 min`: 25 snapshots, about 6 minutes 15 seconds
- `AREETA ANBULATORIOA` at `5 min`: 23 snapshots in a later window, about 5 minutes 45 seconds

This is strong evidence that stale backend states are normal enough to require explicit suppression/confidence handling.

## Same-stop ETA behavior

Within the same nearest stop, ETA changes were distributed roughly like this:

- `0`: dominant case by far
- `-1`: common and expected
- `+1`: present, which should not happen in a clean monotonic countdown
- large negative jumps: present

Observed anomalous same-stop ETA jumps included:

- `22 -> 20`
- `20 -> 15`
- `15 -> 9`
- `9 -> 4`
- `4 -> 2`
- `2 -> 5`
- `10 -> 4`
- `5 -> 1`

The `2 -> 5` change at the same stop is especially important because it shows the backend can revise the ETA upward while keeping the same target stop.

This means:

- ETA is not a stable continuous variable
- interpolation must not assume monotonic countdown within the same stop target
- confidence should drop when ETA increases unexpectedly or jumps too much

## Stop-run durations

Selected nearest-stop run lengths for bus `306`:

- `METRO LAMIAKO`: 59 snapshots, ETA range `0-2`
- `ITURRIBIDE`: 10 snapshots, ETA range `0-2`
- `SAN BARTOLOMÉ`: 17 snapshots, ETA range `1-3`
- `IPARRAGIRRE`: 21 snapshots, ETA range `0-3`

This shows a wide variance in how long the bus remains anchored to a given nearest stop.

Implication:

- segment-duration estimation should not rely on a single global average
- local timing and confidence must be handled adaptively

## Route-order gap behavior

The same gap patterns appeared frequently.

Most frequent gaps for bus `306`:

- `METRO LAMIAKO (DIRECCION AMAIA) -> AREETA ANBULATORIOA`: 457 times
- `METRO LAMIAKO -> AREETA ANBULATORIOA`: 50 times
- `AREETA ANBULATORIOA -> TXOPOETA`: 50 times

This confirms that:

- the prediction list can omit intermediate route stops
- some stop transitions in the raw data are not strictly adjacent in the line definition
- local fallback estimation remains necessary

## What this means for the tracker

### Supported decisions

The data strongly supports:

1. using ordered route stops as the backbone of tracking
2. using segment-based placement instead of whole-line placement
3. suppressing stale buses instead of visualizing them confidently
4. preferring nearby local adjacent ETA deltas over route-wide averages

### Needed next improvements

The data also shows the next algorithmic step clearly:

1. Add confidence scoring, not just binary suppression.
2. Penalize confidence when:
   - same-stop ETA stays flat for too long
   - same-stop ETA increases
   - ETA jumps by more than 1 minute between polls
   - route-order gaps appear near the active segment
3. Separate:
   - route-order confidence
   - ETA stability confidence
   - stale-state confidence

## Implementation status after this analysis

The tracker now includes:

1. a confidence score in diagnostics
2. distinct marker styling for high, medium, and low confidence buses
3. penalties for:
   - repeated identical polls
   - same-stop ETA increases
   - large same-stop ETA jumps
   - route-order gaps in the active prediction list

The remaining work is to tune those weights against more captured sessions rather than treating them as final.

## Related files

- [docs/data-capture-pipeline.md](./data-capture-pipeline.md)
- [docs/live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md)
- [docs/tracking-redesign.md](./tracking-redesign.md)
