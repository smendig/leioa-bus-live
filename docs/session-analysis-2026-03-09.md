---
doc_id: session-analysis-2026-03-09
title: Session Analysis - March 9, 2026
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

# Session Analysis - March 9, 2026

## Session analyzed

- Session id: `session-2026-03-09T07-11-51-345Z`
- Session directory: [captures/sessions/session-2026-03-09T07-11-51-345Z](../captures/sessions/session-2026-03-09T07-11-51-345Z)
- Manifest: [manifest.json](../captures/sessions/session-2026-03-09T07-11-51-345Z/manifest.json)
- Analyzer: [scripts/analyze-session-advanced.mjs](../scripts/analyze-session-advanced.mjs)
- Analysis snapshot time: March 9, 2026 18:41:49 UTC
- Session status at analysis time: `running`

## Session scale

- Duration analyzed: `11.50` hours
- Snapshots analyzed: `2,600`
- Poll interval: `15` seconds
- Failed polls: `0`
- Total stop polls: `83,200`

## High-level network state

The network behavior is completely different from the previous sparse session.

- Only `2` snapshots had `0` active buses.
- `2,551` snapshots had `3` active buses.
- `47` snapshots had `4` active buses.
- `4` unique bus ids were observed:
  - `307` on `L.1 LEIOA`
  - `308` on `L.1 LEIOA`
  - `228` on `L.2 LEIOA`
  - `306` on `L.UNICA`

This means the backend was reporting a near-continuous service picture for most of the day.

## Most important conclusions

1. The route-order model is valid.
2. The backend is capable of showing clearly moving buses over many route loops.
3. The backend can also keep another bus frozen at one stop for hours.
4. Confidence scoring is still necessary because not every visible bus is equally trustworthy.
5. Bus suppression should target clearly pathological cases, not every long dwell.

## Bus-by-bus interpretation

### Bus `307` - plausible moving bus

- Line: `L.1 LEIOA`
- Observed in `2,598` snapshots
- Route transitions: `255`
- Route wraps: `14`
- Unique nearest stops seen: `23`

Representative path sample:

`IPARRAGIRRE -> BULEBARRA -> LIBANO(DIRECCION AMAIA) -> METRO LEIOA -> TXOPOETA -> METRO LAMIAKO (AMAIA) -> AREETA ANBULATORIOA -> METRO LAMIAKO -> TXOPOETA -> METRO LEIOA (LEIOA) -> LIBANO (LEIOA) -> ITURRIBIDE -> IKEA -> DONIBANE SAN JUAN -> KULTUR LEIOA -> ALDEKOENA -> SARRIENA ...`

This is a credible cyclic route progression. However, the ETA stream is still noisy.

Key issues:

- Longest exact freeze:
  - `METRO LAMIAKO`, `1 min`
  - `168` snapshots
  - about `42.98` minutes
- Longest same-stop run:
  - `METRO LAMIAKO`
  - `208` snapshots
  - ETA range `0-1`
  - about `53.25` minutes
- Same-stop ETA increases: `16`
- Large same-stop ETA jumps (`|delta| >= 3`): `8`

Interpretation:

- `307` is the best candidate for a visible live marker.
- It still needs confidence penalties during long frozen `METRO LAMIAKO` runs.

### Bus `308` - likely ghost or depot-side frozen bus

- Line: `L.1 LEIOA`
- Observed in `2,598` snapshots
- Route transitions: only `60`
- Route wraps: `3`
- Unique nearest stops seen: `22`

Critical behavior:

- Longest stop run:
  - `METRO LAMIAKO`
  - `1,378` snapshots
  - ETA range `0-1`
  - about `357.16` minutes
- Additional continuous `METRO LAMIAKO` run:
  - `638` snapshots
  - about `167.42` minutes

Interpretation:

- `308` should be treated as very low confidence for long stretches.
- The tracker should not render `308` as a normal moving bus once it becomes pinned at `METRO LAMIAKO`.

### Bus `228` - plausible moving bus on line 2

- Line: `L.2 LEIOA`
- Observed in `1,576` snapshots
- Route transitions: `174`
- Route wraps: `12`
- Unique nearest stops seen: `16`

Representative path sample:

`METRO LEIOA (AMAIA) -> TXOPOETA (AMAIA) -> METRO LAMIAKO (AMAIA) -> AREETA ANBULATORIOA -> PINUETA -> PINOSOLO -> IPARRAGIRRE (TXORIERRI) -> BULEBARRA (TXORIERRI) -> TORRESOLO (TXORIERRI) -> INDEPENDENTZIA (TXORIERRI) -> TXORIERRI -> INDEPENDENTZIA (AMAIA) -> TORRESOLO (AMAIA) -> IPARRAGIRRE -> BULEBARRA -> LIBANO(DIRECCION AMAIA) ...`

Key issues:

- Longest exact freeze:
  - `INDEPENDENTZIA (DIRECCION AMAIA)`, `4 min`
  - `50` snapshots
  - about `12.95` minutes
- Same-stop ETA increases: `7`
- Large same-stop ETA jumps: `0`

Interpretation:

- `228` looks usable for live rendering.
- It still benefits from moderate confidence penalties during repeated `INDEPENDENTZIA` stalls.

### Bus `306` - moving but still vulnerable to frozen phases

- Line: `L.UNICA`
- Observed in `1,069` snapshots
- Route transitions: `96`
- Route wraps: `6`
- Unique nearest stops seen: `17`

Representative path sample:

`INDEPENDENTZIA (AMAIA) -> TORRESOLO (AMAIA) -> IPARRAGIRRE -> BULEBARRA -> LIBANO(DIRECCION AMAIA) -> METRO LEIOA (AMAIA) -> TXOPOETA (AMAIA) -> METRO LAMIAKO (AMAIA) -> AREETA ANBULATORIOA -> PINUETA -> PINOSOLO -> IPARRAGIRRE (TXORIERRI) -> BULEBARRA (TXORIERRI) -> TORRESOLO (TXORIERRI) -> INDEPENDENTZIA (TXORIERRI) -> TXORIERRI ...`

Key issues:

- Longest exact freeze:
  - `INDEPENDENTZIA (DIRECCION AMAIA)`, `4 min`
  - `114` snapshots
  - about `29.27` minutes
- Longest same-stop run:
  - `INDEPENDENTZIA (DIRECCION AMAIA)`
  - `165` snapshots
  - ETA range `1-4`
  - about `42.65` minutes
- Same-stop ETA increases: `9`

Interpretation:

- `306` should stay visible when route progression is active.
- Confidence should drop sharply during the long `INDEPENDENTZIA` stalls.

## Route-gap behavior

The line definitions still do not perfectly match the observed prediction sequences.

Most relevant recurring gaps:

- `L.1 / bus 307`:
  - `ALDEKOENA -> SARRIENA` appeared `2,314` times
  - `AREETA ANBULATORIOA -> TXOPOETA` appeared `420` times
  - `METRO LAMIAKO -> AREETA ANBULATORIOA` appeared `220` times
- `L.1 / bus 308`:
  - `ALDEKOENA -> SARRIENA` appeared `2,553` times
- `L.2 / bus 228`:
  - `INDEPENDENTZIA (AMAIA) -> TXORIERRI` appeared `40` times
  - `TXORIERRI -> TORRESOLO (AMAIA)` appeared `40` times

Interpretation:

- route order is still the correct backbone
- but adjacent-stop assumptions must remain soft
- confidence should drop when these gaps appear near the active segment

## ETA behavior

The adjacent stop deltas are stable enough to support local interpolation.

- `307`: average adjacent delta `1.82`
- `308`: average adjacent delta `1.84`
- `228`: average adjacent delta `1.84`
- `306`: average adjacent delta `1.81`

This supports continuing to use nearby local adjacent ETA deltas as the main segment-duration estimator.

However, the raw ETA stream is not fully clean:

- same-stop ETA increases still happen
- same-stop large jumps still happen
- long flat `0`/`1` ETA runs are common for suspect buses

## Tracker implications

### Strongly supported

1. Keep route-aware segment placement.
2. Keep confidence scoring.
3. Treat `307`, `228`, and much of `306` as renderable moving buses.
4. Treat `308` as a prime ghost-bus candidate during long `METRO LAMIAKO` runs.

### Needed next improvements

1. Add a stronger penalty for long same-stop low-ETA plateaus, especially `0-1 min`.
2. Split confidence into components:
   - route continuity
   - ETA stability
   - stale plateau duration
3. Promote a bus to `ghost` only after confidence remains very low across a sustained window.
4. Use bus-specific recent history windows rather than a single fixed threshold for all lines.

## Implementation status after this analysis

The live tracker now includes:

1. separate route continuity, ETA stability, and plateau-risk scores
2. diagnostics for low-ETA plateau duration and ghost-candidate status
3. stronger suppression for sustained `0-1 min` same-stop plateaus

The remaining work is to tune the weights and suppression thresholds against more sessions, not to redesign the tracker again.
