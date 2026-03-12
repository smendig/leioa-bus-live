---
doc_id: operational-research-2026-03-09
title: Operational Data Research - March 9, 2026
category: research
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - operational_patterns
canonical_for:
  - hour_of_day_patterns
  - line_switch_behavior
depends_on:
  - session-analysis-2026-03-09
supersedes: []
superseded_by:
  - session-analysis-2026-03-10
---

# Operational Data Research - March 9, 2026

## Scope

This note looks at the March 9, 2026 long-running session from a broader operational perspective instead of only focusing on freeze detection.

Session analyzed:

- [captures/sessions/session-2026-03-09T07-11-51-345Z](../captures/sessions/session-2026-03-09T07-11-51-345Z)

Research script:

- [scripts/research-operational-patterns.mjs](../scripts/research-operational-patterns.mjs)

Command:

```bash
npm run research:operations -- --input captures/sessions/session-2026-03-09T07-11-51-345Z
```

Analysis window at the time of writing:

- first capture local time: `2026-03-09 08:11:51`
- last capture local time: `2026-03-09 20:07:02`

## Perspective 1: Hour of day

The service picture is extremely regular through the day.

From local `08:00` through `20:00`:

- about `3` active tracking keys are present almost continuously
- almost always:
  - `2` on `L.1 LEIOA`
  - `1` on `L.2 LEIOA`
- brief `4`-vehicle windows appear only around:
  - `09:00`
  - `10:00`
  - `14:00`

Interpretation:

- the backend is not just occasionally publishing predictions
- it is maintaining a stable all-day operational picture
- this looks like a managed service feed, not random bursts of ETA data

## Perspective 2: Vehicle identity and service assignment

One important event changes how the tracker should think about identity:

- bus `306` is first seen as `L.UNICA`
- then switches to `L.2 LEIOA`
- exact switch time:
  - `2026-03-09T09:22:03.527Z`
  - local: `2026-03-09 10:22:03`

Interpretation:

- `busId` alone is not a safe tracking identity
- the backend can reassign or reinterpret the same physical vehicle across different service labels
- historical state must be keyed by `busId + lineRef`

## Perspective 3: Route coverage

The moving services cover their declared route stop sets well:

- `307:L.1 LEIOA` visited `23/23` stops
- `228:L.2 LEIOA` visited `16/16` stops
- `306:L.2 LEIOA` visited `16/16` stops
- `308:L.1 LEIOA` visited `22/23` stops

Interpretation:

- `307`, `228`, and `306:L.2` look like real circulating services
- `308` is the main outlier

## Perspective 4: Loop behavior

The loop timings are not perfectly reliable enough to use as a hard truth source, but they are still informative.

Examples:

- `306:L.2 LEIOA`
  - `6` wraps observed
  - loop interval median `37.16` minutes
  - range `36.81` to `44.61`
- `307:L.1 LEIOA`
  - `14` wraps observed
  - loop interval median `46.68` minutes
  - much wider range due to terminal waiting and irregularity

Interpretation:

- some services show a fairly stable route cycle
- others are strongly affected by long dwell or staging behavior at key stops

## Perspective 5: Terminal dwell hotspots

The strongest terminal-style hotspot is:

- `L.1 LEIOA`
- `METRO LAMIAKO`

Observed there:

- `19` low-ETA runs total
- `10` runs of at least `24` polls
- `6` runs of at least `60` polls
- median run duration `6.13` minutes
- max run duration `357.16` minutes
- after `60` polls, `0%` moved within the next `15` minutes

By contrast, `L.2` hotspots are mostly short and healthy:

- `TORRESOLO ( DIRECCION TXORIERRI)` has one longish run, but it resolved
- most other `L.2` low-ETA runs stay under `3.5` minutes

Interpretation:

- `METRO LAMIAKO` on `L.1` behaves like a terminal or layover staging point
- `L.2` behaves much more like a normal circulating route

## Perspective 6: Simultaneous same-stop same-line behavior

This is the strongest new signal in the whole dataset.

For `307:L.1 LEIOA` and `308:L.1 LEIOA`:

- both were present in `2,698` snapshots
- they had the same nearest stop in `567` snapshots
- same-stop overlap rate: about `21%`

That overlap is almost entirely one pattern:

- `475` snapshots:
  - both nearest stop = `METRO LAMIAKO`
  - both ETA = `1`
- `59` snapshots:
  - both nearest stop = `METRO LAMIAKO`
  - ETA pair `0/1`
- `33` snapshots:
  - both nearest stop = `METRO LAMIAKO`
  - ETA pair `1/0`

Interpretation:

- two buses on the same line are repeatedly reported as essentially "at the same stop, 0-1 minutes away"
- this is very hard to reconcile with a raw live per-vehicle GPS positioning feed
- it is much easier to explain as terminal staging, departure countdown logic, or a stop-centric ETA system that does not express precise physical separation at the terminal

## Perspective 7: What kind of system is this?

### What the data does not support

The data does **not** look like raw live GPS coordinates transformed directly into map-ready vehicle positions.

Reasons:

1. extremely long `0-1 min` plateaus exist
2. the worst plateaus cluster at terminal-like stops
3. two same-line buses can simultaneously sit at `METRO LAMIAKO` with ETA `1`

### What the data also does not support

The data also does **not** look like a pure static cron timetable with no operational updates.

Reasons:

1. `306` changes line assignment during the day
2. same-stop ETA increases and jumps exist
3. loop timings and stop behavior are not perfectly fixed
4. some services clearly circulate through full stop coverage with plausible progression

### Best current interpretation

The most defensible interpretation is:

- this is a **stop-centric ETA prediction system**
- it likely incorporates some operational or live state
- but it does **not** expose a clean continuously usable vehicle GPS model
- at terminals, the ETA behavior often acts more like departure staging or coarse holding logic than precise vehicle positioning

In practical terms:

- the app should treat the feed as **prediction data**, not as direct location truth
- map placement should stay heuristic and confidence-based
- terminal hotspots should be down-weighted heavily

## Resulting design implications

1. Keep route-aware segment placement.
2. Keep confidence scoring.
3. Keep composite tracking identity `busId + lineRef`.
4. Add stronger terminal-hotspot priors for:
   - `L.1 LEIOA / METRO LAMIAKO`
5. Consider down-ranking a bus further when:
   - another bus on the same line shares the same nearest stop
   - and both are at `0-1 min`

That last rule is especially justified for `L.1` at `METRO LAMIAKO`.

## Implementation status after this analysis

The tracker now includes:

1. composite tracking identity keyed by `busId + lineRef`
2. an explicit hotspot prior for `L.1 LEIOA / METRO LAMIAKO`
3. same-line same-stop overlap penalties in snapshot-level confidence scoring

This still does not make the feed equivalent to raw GPS. It only makes the map more honest about where the prediction stream is least trustworthy.
