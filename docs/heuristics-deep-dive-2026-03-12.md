---
doc_id: heuristics-deep-dive-2026-03-12
title: Advanced Heuristics & Anomaly Analysis
category: research
status: active
updated_at: 2026-03-12
read_priority: critical
topics:
  - heuristic_tuning
  - anomaly_detection
  - ghost_signatures
canonical_for:
  - tracking_heuristics
  - eta_volatility
depends_on:
  - session-analysis-2026-03-10
supersedes:
  - heuristics-research-2026-03-09
---

# Advanced Heuristics & Anomaly Analysis

Based on a continuous 48-hour data capture (`session-2026-03-10T10-24-41-759Z`), a custom data mining script was written to move beyond simple event aggregation and look at real-world wall-clock behavior. The findings require a fundamental shift in how the frontend tracking engine interprets the Ingenia API.

## 1. The "Rubber Band" ETA Effect (Pessimistic Predictions)

By measuring the *actual* time it took buses to transition between stops versus the API's predicted ETA at that moment, we proved the API ETA is non-linear.

- **ETA 1 min:** Arrives on average **24 seconds later** than predicted.
- **ETA 2 min:** Arrives **18 seconds later**.
- **ETA 3 min:** Arrives **41 seconds sooner** than predicted.
- **ETA 4 min:** Arrives **53 seconds sooner**.
- **ETA 6-8 min:** Arrives **3 to 4 minutes sooner** than predicted.

**Tracker Implication:** The API overestimates travel time from afar, and the countdown clock "accelerates" unnaturally as the bus gets closer. Interpolating using ETA differences causes the bus marker to move sluggishly at the start of a segment and then suddenly "rubber band" forward right before arriving. 

**Solution:** The tracker must stop using ETA deltas for segment durations. It should use an **Empirical Timing Prior map**.

## 2. High-Confidence Empirical Segment Priors

Across 11,000+ snapshots, we extracted the true median travel times (in seconds) for real-world movement between specific stops. These are highly reliable and should hardcoded into the app's routing engine.

Top reliable segments:
- **`AREETA ANBULATORIOA -> PINUETA`**: 242 seconds (~4 mins).
- **`TORRESOLO -> INDEPENDENTZIA`**: 258 seconds (~4.3 mins).
- **`METRO LEIOA -> TXOPOETA`**: 158 seconds (~2.5 mins).
- **`IPARRAGIRRE -> BULEBARRA`**: 79 seconds.
- **`BULEBARRA -> LIBANO`**: 64 seconds.

## 3. Identifiable "Ghost Signatures"

The anomaly analysis proved we can mathematically identify "ghost" or stale buses by looking for unnatural ETA freezes. In a healthy system, an ETA ticks down (or up with traffic). In this API, buses frequently enter a state where the ETA remains *perfectly static* for unreasonable lengths of time.

Observed extreme freezes (exact same ETA, exact same stop, consecutive polls):
- **Bus 307 at `METRO LAMIAKO`:** Frozen at `1 min` for **41 consecutive minutes** (162 polls).
- **Bus 308 at `METRO LAMIAKO`:** Frozen at `1 min` for **35 minutes** (138 polls).
- **Bus 306 & 228 at `INDEPENDENTZIA`:** Frozen at `4 min` and `2 min` respectively for **27 minutes**.

**Heuristic Rule:** If a tracking key polls the exact same ETA for 10 consecutive polls (2.5 minutes), it is mathematically guaranteed to be a stale state. The marker should be hidden.

## 4. The "Volatile Stops" Blacklist

Certain stops in the network produce uniquely chaotic ETA streams, featuring constant ETA increases (predicting 4 mins, then suddenly 7 mins) and massive jumps (shifting by 3+ minutes in a single 15-second interval).

Most volatile stops (Blacklist Candidates):
1. **`AREETA ANBULATORIOA`**: 113 increases, 64 massive jumps.
2. **`TORRESOLO (DIRECCION TXORIERRI)`**: 53 increases, 51 massive jumps.
3. **`METRO LEIOA ( SENTIDO AMAIA ETORBIDEA)`**: 91 increases, 12 massive jumps.

**Heuristic Rule:** Implement a **Volatility Penalty Map**. When the tracker detects a bus approaching a known volatile stop, it should immediately disregard sudden ETA changes and rely entirely on the empirical segment speed limit.
