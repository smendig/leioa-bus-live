---
doc_id: capture-pipeline
title: Data Capture Pipeline
category: operations
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - capture_pipeline
canonical_for:
  - capture_pipeline
depends_on: []
supersedes: []
superseded_by: []
---

# Data Capture Pipeline

## Purpose

This project now has a raw-data capture pipeline designed for long-running collection of Ingenia transit data.

The main objective is:

1. capture raw server responses over long time spans
2. tolerate interruptions, restarts, and incomplete datasets
3. preserve data in a format that can be analyzed later with better algorithms

This is the preferred foundation for future movement modeling and prediction work.

## Design principles

- Capture raw data first.
- Keep the capture format append-only.
- Never require a complete run to produce usable output.
- Make resume cheap after reboot or manual interruption.
- Separate capture from analysis.

## Tools

### One-shot capture

Script:

- [scripts/capture-live-snapshots.mjs](../scripts/capture-live-snapshots.mjs)

Use when:

- you want a quick bounded sample
- you do not need resume semantics

Example:

```bash
npm run capture:live -- --duration 300 --interval 15
```

### Resumable session capture

Script:

- [scripts/capture-live-session.mjs](../scripts/capture-live-session.mjs)

Use when:

- you want to collect data over hours or days
- the machine may reboot
- you want to stop and resume later

Examples:

```bash
npm run capture:session -- --interval 15
npm run capture:session -- --resume <session-id>
npm run capture:session -- --resume <session-id> --maxSnapshots 100
```

### Analysis

Script:

- [scripts/analyze-live-snapshots.mjs](../scripts/analyze-live-snapshots.mjs)

Supported inputs:

- legacy single JSON capture file
- resumable session directory
- resumable session manifest path

Examples:

```bash
npm run analyze:live -- --input captures/live-capture-2026-03-07T22-20-12.053Z.json
npm run analyze:live -- --input captures/sessions/<session-id>
```

## Session format

Each resumable capture session lives in its own directory:

```text
captures/sessions/<session-id>/
  manifest.json
  topology.json
  snapshots.ndjson
  events.ndjson
```

### `manifest.json`

Tracks session metadata and progress:

- `sessionId`
- `createdAt`
- `updatedAt`
- `status`
- `intervalSeconds`
- `completedSnapshots`
- `failedPolls`
- `totalStopPolls`
- `lastCaptureAt`

### `topology.json`

Stores the topology fetched at session creation time:

- lines
- stations

This preserves the route and stop context used during the capture window.

### `snapshots.ndjson`

Append-only newline-delimited JSON.

Each line is one network-wide poll:

```json
{
  "capturedAt": "2026-03-08T08:35:47.856Z",
  "arrivals": [...]
}
```

This format is robust because partially collected data is still readable even if the run is interrupted.

### `events.ndjson`

Append-only operational log of:

- run start
- run completion
- manual stop
- capture errors

This is useful when analyzing gaps or resuming sessions later.

## Resume behavior

The resumable session script works by:

1. creating a session directory once
2. appending each snapshot to `snapshots.ndjson`
3. updating `manifest.json` atomically
4. allowing the next run to continue with `--resume`

If the machine reboots:

- the existing snapshots remain on disk
- the topology remains on disk
- the manifest remains on disk
- you resume by running the same session again

Example:

```bash
npm run capture:session -- --resume session-2026-03-08T08-35-47-517Z
```

## Why this format is better for later analysis

The analysis problem is harder than the capture problem. This format is intended to support that.

Advantages:

- data can span many days
- gaps are acceptable
- runs do not need to be contiguous
- raw responses are preserved for future reprocessing
- analysis code can evolve without recollecting the data

This matters because future algorithms may need:

- segment-level ETA statistics
- stale prediction detection
- confidence scoring
- route-order gap analysis
- time-of-day behavior
- weekday vs weekend comparisons

## Recommended operating mode

For serious collection, use resumable sessions only.

Suggested pattern:

1. start one session with a 15-second interval
2. let it run as long as possible
3. if the machine restarts, resume the same session
4. periodically analyze the session directory
5. start a new session only when you intentionally want a new dataset boundary

## Current limitations

- topology is captured once per session, not refreshed during the session
- no automatic session rotation yet
- no built-in daily rollups yet
- no advanced pattern detection yet
- no automatic labeling of weekday/weekend or service regime yet

## Next logical improvements

1. Add a `list-sessions` script to inspect existing sessions quickly.
2. Add an `analyze:session` script that produces richer reports than the current generic analyzer.
3. Add daily or hourly rollup exports derived from `snapshots.ndjson`.
4. Add confidence and stale-state metrics directly into offline analysis outputs.

## Related files

- [README.md](../README.md)
- [docs/live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md)
- [docs/tracking-redesign.md](./tracking-redesign.md)
