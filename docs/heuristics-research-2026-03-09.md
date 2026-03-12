---
doc_id: heuristics-research-2026-03-09
title: Heuristics Research - March 9, 2026
category: research
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - heuristic_tuning
canonical_for:
  - heuristic_threshold_evidence
depends_on:
  - session-analysis-2026-03-08
  - session-analysis-2026-03-09
supersedes: []
superseded_by: []
---

# Heuristics Research - March 9, 2026

## Scope

This document summarizes replay-based heuristic research across the captured session data available in the repository at the time of analysis.

Inputs analyzed:

- [captures/sessions/session-2026-03-08T08-40-15-378Z](../captures/sessions/session-2026-03-08T08-40-15-378Z)
- [captures/sessions/session-2026-03-09T07-11-51-345Z](../captures/sessions/session-2026-03-09T07-11-51-345Z)

Research script:

- [scripts/research-tracking-heuristics.mjs](../scripts/research-tracking-heuristics.mjs)

Command:

```bash
npm run research:heuristics
```

## Why this research was needed

The tracker already had route-aware interpolation and confidence scoring, but two important questions were still open:

1. When does a repeated low-ETA plateau become safe to suppress?
2. Is `busId` alone a stable enough identity for tracking history and ghost suppression?

This research answers both using replay over captured data instead of intuition.

## Main findings

### 1. Short low-ETA plateaus are usually real movement, not ghosts

Across all low-ETA (`0-1 min`) same-stop runs:

- After `12` polls (`3` minutes):
  - `82.9%` eventually moved
  - `74.3%` moved within `15` minutes
- After `24` polls (`6` minutes):
  - `66.7%` eventually moved
  - `41.7%` moved within `15` minutes
- After `40` polls (`10` minutes):
  - `62.5%` eventually moved
  - only `25%` moved within `15` minutes
- After `60` polls (`15` minutes):
  - `50%` eventually moved
  - `0%` moved within `15` minutes
  - only `16.7%` moved within `30` minutes

Interpretation:

- A low-ETA plateau of `3` minutes is far too early for suppression.
- `6` minutes is still mostly a warning zone, not a ghost zone.
- `15` minutes is a reasonable suppression threshold if the goal is to avoid showing buses that are unlikely to move again soon on the live map.

### 2. The plateau behavior is highly line-dependent

`L.2 LEIOA` behaved much better than `L.1 LEIOA`:

- `L.2 LEIOA` had no low-ETA plateau runs reaching `40` polls
- its `12`-poll plateaus moved `100%` of the time
- most were short and resolved quickly

`L.1 LEIOA` is where the long frozen states live:

- at `24` polls, only `36.4%` moved within `15` minutes
- at `60` polls, `0%` moved within `15` minutes
- the dominant hotspot was `METRO LAMIAKO`

Interpretation:

- plateau heuristics must stay conservative for short runs
- but long `L.1` low-ETA plateaus are a real failure mode, not a rare edge case

### 3. Hotspots matter

The strongest low-ETA plateau hotspot found so far is:

- `L.1 LEIOA` at `METRO LAMIAKO`

For that hotspot:

- median run duration was `6.13` minutes
- max observed run duration was `357.16` minutes
- after `24` polls, only `40%` moved within `15` minutes
- after `60` polls, `0%` moved within `15` minutes

There are also short, healthy hotspots on `L.2`, but those resolve quickly and should not be treated like ghosts.

### 4. `busId` is not a stable enough tracking identity by itself

One concrete cross-line switch was observed:

- bus `306`
- from `L.UNICA`
- to `L.2 LEIOA`
- at `2026-03-09T09:22:03.527Z`

This means state keyed only by `busId` can leak across service changes:

- stale history
- plateau counters
- persisted ghost suppression
- interpolation timing state

Interpretation:

- internal tracking identity must be `busId + lineRef`
- the user-visible label can still remain `busId`

## Resulting heuristic decisions

These are the current decisions supported by the data.

### Plateau warning threshold

- `LOW_ETA_PLATEAU_WARNING_POLLS = 24`

Reason:

- `12` polls was too aggressive because most runs still moved soon
- `24` polls is a better point to start degrading confidence without suppressing

### Plateau ghost threshold

- `LOW_ETA_GHOST_POLLS = 60`

Reason:

- by `60` polls, no observed eligible run moved within the next `15` minutes
- only a small minority moved within `30` minutes
- this is acceptable for a live map that should prioritize currently moving buses over parked or layover vehicles

### Tracking identity

- internal tracking state is now keyed by `trackingKey = busId + ':' + lineRef`

Reason:

- prevents line-switch contamination in:
  - marker state
  - interpolation timing
  - prediction history
  - local ghost persistence

## Code changes applied from this research

- [src/config/transit.ts](../src/config/transit.ts)
  - plateau warning threshold moved from `12` to `24`
- [src/utils/tracking.ts](../src/utils/tracking.ts)
  - active buses are now grouped by composite tracking key
- [src/composables/useTransitMap.ts](../src/composables/useTransitMap.ts)
  - marker state, interpolation state, prediction history, and persisted ghost suppression now use composite tracking keys
  - plateau confidence is now combined with snapshot-level context
  - same-line same-stop overlap can now reduce confidence
  - `L.1 LEIOA / METRO LAMIAKO` now has an explicit hotspot prior

## What remains open

1. The current ghost model still treats all long low-ETA plateaus as equivalent once they cross the hard suppression threshold.
2. The next refinement should be a stop-risk prior:
   - terminal or layover hotspots like `METRO LAMIAKO` on `L.1`
   - versus short healthy low-ETA stops on `L.2`
3. More sessions are needed before introducing stop-specific suppression maps into production logic.
