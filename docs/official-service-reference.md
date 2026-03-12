---
doc_id: official-service-reference-md
title: Official Service Reference
category: reference
status: active
updated_at: 2026-03-10
read_priority: specialized
topics:
  - official_schedule_prior
canonical_for:
  - official_schedule_prior_explanation
depends_on:
  - official-service-reference-json
supersedes: []
superseded_by: []
---

# Official Service Reference

Structured reference data derived from the official LeioaBusa webpage text is available in:

- [docs/official-service-reference.json](./official-service-reference.json)

## What this file is for

This JSON is meant to provide a machine-readable "official schedule prior" for:

- line existence and naming
- route stop order
- weekday / weekend / night service windows
- published headway values
- line-to-API mapping
- stop-name hint mapping between official labels and API labels

## What this file does not provide

It does **not** provide exact official clock times for each stop.

The official source text appears to publish:

- stop order
- frequency windows

But it does **not** publish:

- per-stop departure tables
- exact offset minutes from the line origin

So this file is suitable for:

1. generating trip departure series from line origins
2. deciding whether a line should be considered operational at a given local time
3. penalizing live states that contradict official service windows
4. serving as the base structure to which future exact stop offsets can be attached

## Recommended next step

If you want per-stop "official timing" later, extend the JSON with:

- `stopOffsetMinutesFromOrigin`

for each stop occurrence in each line pattern.

Those offsets should come from one of:

1. a future official timetable/PDF if found
2. carefully filtered empirical medians learned from the cleaner capture data
