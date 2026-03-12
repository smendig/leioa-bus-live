import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const inputPath = args.input

if (!inputPath) {
  process.stderr.write('Usage: node scripts/analyze-session-advanced.mjs --input <session-dir-or-manifest>\n')
  process.exit(1)
}

const capture = await loadCapture(path.resolve(inputPath))
const lineMetadata = buildLineMetadata(capture.topology.lines)
const summary = summarizeCapture(capture, lineMetadata)

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

function parseArgs(argv) {
  const parsed = {}

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      continue
    }

    const key = current.slice(2)
    const value = argv[index + 1]

    if (!value || value.startsWith('--')) {
      parsed[key] = 'true'
      continue
    }

    parsed[key] = value
    index += 1
  }

  return parsed
}

function summarizeCapture(capture, lineMetadata) {
  const snapshots = [...capture.snapshots].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
  const perBus = new Map()
  const activeBusCountDistribution = new Map()
  const continuityGapMs = Math.max(30_000, capture.meta.intervalSeconds * 2_000)

  snapshots.forEach((snapshot) => {
    const groupedByBus = groupSnapshotByBus(snapshot, lineMetadata)
    const activeBusCount = groupedByBus.size
    activeBusCountDistribution.set(
      activeBusCount,
      (activeBusCountDistribution.get(activeBusCount) ?? 0) + 1,
    )

    groupedByBus.forEach((record, busId) => {
      if (!perBus.has(busId)) {
        perBus.set(busId, [])
      }

      perBus.get(busId).push(record)
    })
  })

  const busSummaries = [...perBus.entries()]
    .map(([busId, records]) => summarizeBus(busId, records, lineMetadata, continuityGapMs))
    .sort((left, right) => right.snapshotsObserved - left.snapshotsObserved)

  const firstCaptureAt = snapshots[0]?.capturedAt ?? null
  const lastCaptureAt = snapshots.at(-1)?.capturedAt ?? null

  return {
    session: {
      sessionId: capture.meta.sessionId,
      status: capture.meta.status,
      createdAt: capture.meta.createdAt,
      firstCaptureAt,
      lastCaptureAt,
      updatedAt: capture.meta.updatedAt,
      intervalSeconds: capture.meta.intervalSeconds,
      completedSnapshots: capture.meta.completedSnapshots,
      failedPolls: capture.meta.failedPolls,
      totalStopPolls: capture.meta.totalStopPolls,
      durationHours: firstCaptureAt && lastCaptureAt
        ? round((Date.parse(lastCaptureAt) - Date.parse(firstCaptureAt)) / 3_600_000, 2)
        : null,
    },
    network: {
      snapshotsAnalyzed: snapshots.length,
      uniqueBusCount: perBus.size,
      activeBusCountDistribution: Object.fromEntries(
        [...activeBusCountDistribution.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([count, occurrences]) => [String(count), occurrences]),
      ),
      linesObserved: summarizeLinesObserved(busSummaries),
    },
    buses: busSummaries,
  }
}

function groupSnapshotByBus(snapshot, lineMetadata) {
  const groupedByBus = new Map()

  snapshot.arrivals.forEach((stationSnapshot) => {
    stationSnapshot.arrivals.forEach((arrival) => {
      const busId = String(arrival.IdBus)
      if (!groupedByBus.has(busId)) {
        groupedByBus.set(busId, [])
      }

      groupedByBus.get(busId).push({
        spRef: String(stationSnapshot.station.spRef),
        spName: stationSnapshot.station.spName,
        minutes: Number(arrival.Minutes),
        lineRef: arrival.LRef,
      })
    })
  })

  return new Map(
    [...groupedByBus.entries()].map(([busId, predictions]) => {
      const sortedPredictions = predictions.sort((left, right) => left.minutes - right.minutes)
      const nearest = sortedPredictions[0] ?? null
      const line = nearest ? lineMetadata.get(nearest.lineRef) : null
      const lineIndex = nearest ? line?.indexByStopId.get(nearest.spRef) ?? null : null

      return [
        busId,
        {
          capturedAt: snapshot.capturedAt,
          lineRef: nearest?.lineRef ?? null,
          arrivalsCount: sortedPredictions.length,
          nearest,
          lineIndex,
          routeGaps: nearest && line ? extractRouteGaps(sortedPredictions, line) : [],
          adjacentMinuteDeltas: nearest && line ? extractAdjacentMinuteDeltas(sortedPredictions, line) : [],
        },
      ]
    }),
  )
}

function summarizeBus(busId, records, lineMetadata, continuityGapMs) {
  const sortedRecords = [...records].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
  const firstRecord = sortedRecords[0] ?? null
  const lastRecord = sortedRecords.at(-1) ?? null
  const lineRef = firstRecord?.lineRef ?? null
  const line = lineRef ? lineMetadata.get(lineRef) : null
  const observationSegments = splitContinuousSegments(sortedRecords, continuityGapMs)

  const transitionCount = countTransitions(observationSegments)
  const lineIndexWrapCount = countLineIndexWraps(observationSegments)
  const nearestStopPathSample = compressStopNames(observationSegments).slice(0, 40)
  const exactFreezeRuns = collectExactFreezeRuns(observationSegments)
  const stopRuns = collectStopRuns(observationSegments)
  const sameStopEtaDeltaStats = summarizeSameStopEtaDeltas(observationSegments)
  const routeGapSummary = summarizeRouteGaps(sortedRecords)
  const adjacentMinuteDeltaSummary = summarizeMinuteDeltas(
    sortedRecords.flatMap((record) => record.adjacentMinuteDeltas),
  )

  return {
    busId,
    lineRef,
    lineName: line?.name ?? lineRef,
    snapshotsObserved: sortedRecords.length,
    firstSeenAt: firstRecord?.capturedAt ?? null,
    lastSeenAt: lastRecord?.capturedAt ?? null,
    observationSegmentCount: observationSegments.length,
    observationSegments: observationSegments.slice(0, 5).map(summarizeObservationSegment),
    uniqueNearestStopCount: new Set(
      sortedRecords.map((record) => record.nearest?.spName).filter(Boolean),
    ).size,
    nearestStopPathSample,
    transitionCount,
    lineIndexWrapCount,
    longestExactFreezeRuns: exactFreezeRuns.slice(0, 5),
    longestStopRuns: stopRuns.slice(0, 5),
    sameStopEtaDeltaStats,
    routeGapSummary,
    adjacentMinuteDeltaSummary,
  }
}

function countTransitions(segments) {
  let transitions = 0

  segments.forEach((records) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (previous.nearest?.spRef !== current.nearest?.spRef) {
        transitions += 1
      }
    }
  })

  return transitions
}

function countLineIndexWraps(segments) {
  let wraps = 0

  segments.forEach((records) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (
        previous.lineIndex !== null &&
        current.lineIndex !== null &&
        current.lineIndex < previous.lineIndex
      ) {
        wraps += 1
      }
    }
  })

  return wraps
}

function compressStopNames(segments) {
  const compressed = []

  segments.forEach((records, segmentIndex) => {
    if (segmentIndex > 0) {
      compressed.push('[gap]')
    }

    records.forEach((record) => {
      const stopName = record.nearest?.spName
      if (!stopName) {
        return
      }

      if (compressed.at(-1) !== stopName) {
        compressed.push(stopName)
      }
    })
  })

  return compressed
}

function collectExactFreezeRuns(segments) {
  const runs = []
  segments.forEach((records) => {
    let currentRun = null

    records.forEach((record) => {
      const stopId = record.nearest?.spRef ?? null
      const stopName = record.nearest?.spName ?? null
      const minutes = record.nearest?.minutes ?? null

      if (!stopId || minutes === null) {
        currentRun = null
        return
      }

      const stateKey = `${stopId}:${minutes}`

      if (currentRun?.stateKey === stateKey) {
        currentRun.count += 1
        currentRun.endAt = record.capturedAt
        return
      }

      if (currentRun) {
        runs.push(finalizeRun(currentRun))
      }

      currentRun = {
        stateKey,
        stopId,
        stopName,
        minutes,
        startAt: record.capturedAt,
        endAt: record.capturedAt,
        count: 1,
      }
    })

    if (currentRun) {
      runs.push(finalizeRun(currentRun))
    }
  })

  return runs.sort((left, right) => right.snapshots - left.snapshots)
}

function collectStopRuns(segments) {
  const runs = []
  segments.forEach((records) => {
    let currentRun = null

    records.forEach((record) => {
      const stopId = record.nearest?.spRef ?? null
      const stopName = record.nearest?.spName ?? null
      const minutes = record.nearest?.minutes ?? null

      if (!stopId || minutes === null) {
        currentRun = null
        return
      }

      if (currentRun?.stopId === stopId) {
        currentRun.count += 1
        currentRun.endAt = record.capturedAt
        currentRun.minEta = Math.min(currentRun.minEta, minutes)
        currentRun.maxEta = Math.max(currentRun.maxEta, minutes)
        return
      }

      if (currentRun) {
        runs.push(finalizeStopRun(currentRun))
      }

      currentRun = {
        stopId,
        stopName,
        startAt: record.capturedAt,
        endAt: record.capturedAt,
        count: 1,
        minEta: minutes,
        maxEta: minutes,
      }
    })

    if (currentRun) {
      runs.push(finalizeStopRun(currentRun))
    }
  })

  return runs.sort((left, right) => right.snapshots - left.snapshots)
}

function summarizeSameStopEtaDeltas(segments) {
  const distribution = new Map()
  const anomalousSamples = []
  let sameStopComparisons = 0
  let etaIncreaseCount = 0
  let largeJumpCount = 0

  segments.forEach((records) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (previous.nearest?.spRef !== current.nearest?.spRef) {
        continue
      }

      const delta = current.nearest.minutes - previous.nearest.minutes
      sameStopComparisons += 1
      distribution.set(delta, (distribution.get(delta) ?? 0) + 1)

      if (delta > 0) {
        etaIncreaseCount += 1
      }

      if (Math.abs(delta) >= 3) {
        largeJumpCount += 1
        anomalousSamples.push({
          capturedAt: current.capturedAt,
          stopName: current.nearest.spName,
          fromMinutes: previous.nearest.minutes,
          toMinutes: current.nearest.minutes,
          delta,
        })
      }
    }
  })

  return {
    sameStopComparisons,
    etaIncreaseCount,
    largeJumpCount,
    deltaDistribution: Object.fromEntries(
      [...distribution.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([delta, count]) => [String(delta), count]),
    ),
    anomalousSamples: anomalousSamples.slice(0, 12),
  }
}

function splitContinuousSegments(records, continuityGapMs) {
  const segments = []
  let currentSegment = []

  records.forEach((record, index) => {
    if (index === 0) {
      currentSegment.push(record)
      return
    }

    const previous = records[index - 1]
    const gapMs = Date.parse(record.capturedAt) - Date.parse(previous.capturedAt)

    if (gapMs > continuityGapMs) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment)
      }
      currentSegment = [record]
      return
    }

    currentSegment.push(record)
  })

  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  return segments
}

function summarizeObservationSegment(records) {
  return {
    snapshots: records.length,
    startAt: records[0]?.capturedAt ?? null,
    endAt: records.at(-1)?.capturedAt ?? null,
    durationMinutes:
      records.length > 1
        ? round((Date.parse(records.at(-1).capturedAt) - Date.parse(records[0].capturedAt)) / 60000, 2)
        : 0,
  }
}

function summarizeRouteGaps(records) {
  const pairCounts = new Map()
  let snapshotsWithGaps = 0
  let totalGapPairs = 0

  records.forEach((record) => {
    if (record.routeGaps.length > 0) {
      snapshotsWithGaps += 1
    }

    record.routeGaps.forEach((gap) => {
      totalGapPairs += 1
      pairCounts.set(gap.key, {
        key: gap.key,
        fromStop: gap.fromStop,
        toStop: gap.toStop,
        count: (pairCounts.get(gap.key)?.count ?? 0) + 1,
      })
    })
  })

  return {
    snapshotsWithGaps,
    totalGapPairs,
    topGapPairs: [...pairCounts.values()].sort((left, right) => right.count - left.count).slice(0, 10),
  }
}

function summarizeMinuteDeltas(values) {
  if (values.length === 0) {
    return {
      samples: 0,
      average: null,
      median: null,
      min: null,
      max: null,
    }
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middleIndex = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[middleIndex - 1] + sorted[middleIndex]) / 2
      : sorted[middleIndex]

  return {
    samples: values.length,
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    median: round(median, 2),
    min: sorted[0],
    max: sorted.at(-1),
  }
}

function summarizeLinesObserved(busSummaries) {
  const lineStats = new Map()

  busSummaries.forEach((bus) => {
    if (!bus.lineRef) {
      return
    }

    lineStats.set(bus.lineRef, {
      lineRef: bus.lineRef,
      lineName: bus.lineName,
      busesObserved: (lineStats.get(bus.lineRef)?.busesObserved ?? 0) + 1,
      totalSnapshots: (lineStats.get(bus.lineRef)?.totalSnapshots ?? 0) + bus.snapshotsObserved,
    })
  })

  return [...lineStats.values()].sort((left, right) => right.totalSnapshots - left.totalSnapshots)
}

function buildLineMetadata(lines) {
  return new Map(
    lines.map((line) => {
      const stops = line.Directions?.[0]?.stops ?? []
      return [
        line.LRef,
        {
          name: line.dName ?? line.LName ?? line.LRef,
          stops,
          indexByStopId: new Map(stops.map((stop, index) => [String(stop.spRef), index])),
        },
      ]
    }),
  )
}

function extractRouteGaps(predictions, line) {
  const gaps = []

  for (let index = 0; index < predictions.length - 1; index += 1) {
    const current = predictions[index]
    const next = predictions[index + 1]
    const currentIndex = line.indexByStopId.get(current.spRef)
    const nextIndex = line.indexByStopId.get(next.spRef)

    if (currentIndex === undefined || nextIndex === undefined) {
      continue
    }

    if (((currentIndex + 1) % line.stops.length) !== nextIndex) {
      gaps.push({
        key: `${current.spName} -> ${next.spName}`,
        fromStop: current.spName,
        toStop: next.spName,
      })
    }
  }

  return gaps
}

function extractAdjacentMinuteDeltas(predictions, line) {
  const deltas = []

  for (let index = 0; index < predictions.length - 1; index += 1) {
    const current = predictions[index]
    const next = predictions[index + 1]
    const currentIndex = line.indexByStopId.get(current.spRef)
    const nextIndex = line.indexByStopId.get(next.spRef)

    if (currentIndex === undefined || nextIndex === undefined) {
      continue
    }

    if (((currentIndex + 1) % line.stops.length) === nextIndex) {
      deltas.push(next.minutes - current.minutes)
    }
  }

  return deltas
}

function finalizeRun(run) {
  return {
    stopId: run.stopId,
    stopName: run.stopName,
    minutes: run.minutes,
    snapshots: run.count,
    startAt: run.startAt,
    endAt: run.endAt,
    durationMinutes: round((Date.parse(run.endAt) - Date.parse(run.startAt)) / 60000, 2),
  }
}

function finalizeStopRun(run) {
  return {
    stopId: run.stopId,
    stopName: run.stopName,
    snapshots: run.count,
    startAt: run.startAt,
    endAt: run.endAt,
    durationMinutes: round((Date.parse(run.endAt) - Date.parse(run.startAt)) / 60000, 2),
    etaRange: {
      min: run.minEta,
      max: run.maxEta,
    },
  }
}

function round(value, digits) {
  return Number(value.toFixed(digits))
}

async function loadCapture(resolvedInputPath) {
  const stat = await fs.stat(resolvedInputPath)

  if (stat.isDirectory()) {
    return loadSessionCapture(resolvedInputPath)
  }

  const payload = JSON.parse(await fs.readFile(resolvedInputPath, 'utf8'))
  if (payload.files?.snapshots) {
    return loadSessionCapture(path.dirname(resolvedInputPath))
  }

  throw new Error(`Unsupported capture format: ${resolvedInputPath}`)
}

async function loadSessionCapture(sessionDir) {
  const manifest = JSON.parse(await fs.readFile(path.join(sessionDir, 'manifest.json'), 'utf8'))
  const topology = JSON.parse(
    await fs.readFile(path.join(sessionDir, manifest.files.topology), 'utf8'),
  )
  const snapshotsNdjson = await fs.readFile(
    path.join(sessionDir, manifest.files.snapshots),
    'utf8',
  )

  return {
    meta: manifest,
    topology,
    snapshots: snapshotsNdjson
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  }
}
