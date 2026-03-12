---
doc_id: docs-index
title: Documentation Index
category: reference
status: active
updated_at: 2026-03-10
read_priority: entrypoint
topics:
  - capture_pipeline
  - official_schedule_prior
  - tracking_design
  - session_analysis
  - heuristic_tuning
  - operational_patterns
  - live_api_reverse_engineering
canonical_for:
  - documentation_navigation
depends_on: []
supersedes: []
superseded_by: []
---

# Documentation Index

This directory is organized as a documentation system, not a single narrative.

The goal is:

1. keep all detailed research and operational notes
2. make the current source of truth obvious by topic
3. make historical documents discoverable without forcing every future reader or agent to read everything

## Documentation Model

The docs in this repository fall into four categories:

### 1. `reference`

Stable inputs or structured priors that other parts of the project can depend on.

Use these when you need:

- official service windows
- line naming and mapping
- stable machine-readable schedule priors

Primary docs:

- [official-service-reference.md](./official-service-reference.md)
- [official-service-reference.json](./official-service-reference.json)

### 2. `design`

Target architecture, intended tracker behavior, and implementation phases.

Use these when you need:

- current tracking design intent
- what the tracker is supposed to do
- remaining implementation gaps

Primary doc:

- [tracking-redesign.md](./tracking-redesign.md)

### 3. `research`

Time-bounded empirical findings produced from captures or live inspection.

Use these when you need:

- evidence for heuristics
- evidence for hour-of-day behavior
- evidence for ghost/stale patterns
- historical evolution of conclusions

Primary current docs:

- [session-analysis-2026-03-10.md](./session-analysis-2026-03-10.md)
- [heuristics-research-2026-03-09.md](./heuristics-research-2026-03-09.md)
- [operational-research-2026-03-09.md](./operational-research-2026-03-09.md)

Historical but still useful:

- [live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md)
- [session-analysis-2026-03-08.md](./session-analysis-2026-03-08.md)
- [session-analysis-2026-03-09.md](./session-analysis-2026-03-09.md)

### 4. `operations`

Capture and analysis workflow documentation.

Use these when you need:

- how capture sessions are stored
- how resume works
- which scripts to run for collection and analysis

Primary doc:

- [data-capture-pipeline.md](./data-capture-pipeline.md)

## Canonical Documents By Topic

### Capture Pipeline

Canonical:

- [data-capture-pipeline.md](./data-capture-pipeline.md)

### Official Schedule Prior

Canonical:

- [official-service-reference.json](./official-service-reference.json)

Human-readable companion:

- [official-service-reference.md](./official-service-reference.md)

### Tracking Design

Canonical:

- [tracking-redesign.md](./tracking-redesign.md)

### Latest Network Behavior / Current Empirical State

Canonical current session view:

- [session-analysis-2026-03-10.md](./session-analysis-2026-03-10.md)

### Heuristic Tuning Evidence

Canonical:

- [heuristics-research-2026-03-09.md](./heuristics-research-2026-03-09.md)

### Operational / Hour-of-Day Behavior

Canonical:

- [operational-research-2026-03-09.md](./operational-research-2026-03-09.md)

## Historical Progression

These docs should be read as a sequence of evidence accumulation, not competing truths:

1. [live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md)
   - initial live reverse-engineering and topology findings
2. [session-analysis-2026-03-08.md](./session-analysis-2026-03-08.md)
   - sparse-session behavior and first ghost-state evidence
3. [session-analysis-2026-03-09.md](./session-analysis-2026-03-09.md)
   - full service-day behavior and multiple concurrent buses
4. [heuristics-research-2026-03-09.md](./heuristics-research-2026-03-09.md)
   - replay-based threshold evidence
5. [operational-research-2026-03-09.md](./operational-research-2026-03-09.md)
   - hour-of-day and service-pattern interpretation
6. [session-analysis-2026-03-10.md](./session-analysis-2026-03-10.md)
   - overnight singleton behavior and strongest anti-GPS evidence

## Minimal Read Paths

These are not summaries. They are routing guides for choosing the right detailed documents.

### If the task is tracker behavior or marker confidence

Read in this order:

1. [tracking-redesign.md](./tracking-redesign.md)
2. [session-analysis-2026-03-10.md](./session-analysis-2026-03-10.md)
3. [heuristics-research-2026-03-09.md](./heuristics-research-2026-03-09.md)

### If the task is official schedule priors or service availability

Read in this order:

1. [official-service-reference.json](./official-service-reference.json)
2. [official-service-reference.md](./official-service-reference.md)
3. [session-analysis-2026-03-10.md](./session-analysis-2026-03-10.md)

### If the task is capture tooling or raw-data collection

Read in this order:

1. [data-capture-pipeline.md](./data-capture-pipeline.md)

### If the task is understanding how the live API was reverse engineered

Read in this order:

1. [live-data-research-2026-03-07.md](./live-data-research-2026-03-07.md)
2. [tracking-redesign.md](./tracking-redesign.md)

## Registry

The machine-readable document registry is:

- [document-registry.json](./document-registry.json)

That file exists so future tooling or agents can:

- identify the current canonical document by topic
- distinguish active reference docs from historical research notes
- understand document dependencies and supersession relationships

## Maintenance Rule

When adding a new document:

1. do not delete older detailed notes unless they are incorrect
2. update [document-registry.json](./document-registry.json)
3. add YAML front matter to the markdown file itself
4. keep the front matter aligned with the registry entry
5. update this index only if the new document becomes canonical for a topic
