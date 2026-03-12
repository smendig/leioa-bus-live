import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const inputPath = args.input

if (!inputPath) {
  process.stderr.write('Usage: node scripts/research-operational-patterns.mjs --input <session-dir-or-manifest>\n')
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
  const nearestByTrackingKey = buildNearestTimelineByTrackingKey(snapshots, lineMetadata)
  const hourlyActivity = summarizeHourlyActivity(snapshots)
  const trackingKeys = summarizeTrackingKeys(nearestByTrackingKey, lineMetadata, capture.meta.intervalSeconds)
  const plateauHotspots = summarizePlateauHotspots(nearestByTrackingKey, capture.meta.intervalSeconds)
  const lineSwitches = findLineSwitches(snapshots)

  return {
    session: {
      sessionId: capture.meta.sessionId,
      status: capture.meta.status,
      intervalSeconds: capture.meta.intervalSeconds,
      completedSnapshots: capture.meta.completedSnapshots,
      firstCaptureAt: snapshots[0]?.capturedAt ?? null,
      lastCaptureAt: snapshots.at(-1)?.capturedAt ?? null,
      firstCaptureLocal: snapshots[0] ? formatLocalDateTime(snapshots[0].capturedAt) : null,
      lastCaptureLocal: snapshots.at(-1) ? formatLocalDateTime(snapshots.at(-1).capturedAt) : null,
    },
    hourlyActivity,
    trackingKeys,
    plateauHotspots,
    lineSwitches,
  }
}

function summarizeHourlyActivity(snapshots) {
  const hourly = new Map()

  snapshots.forEach((snapshot) => {
    const hourLocal = formatLocalHour(snapshot.capturedAt)
    const activeByLine = new Map()
    const keys = new Set()

    snapshot.arrivals.forEach((stationSnapshot) => {
      stationSnapshot.arrivals.forEach((arrival) => {
        const trackingKey = `${arrival.IdBus}:${arrival.LRef}`
        keys.add(trackingKey)
        activeByLine.set(arrival.LRef, (activeByLine.get(arrival.LRef) ?? 0) + 1)
      })
    })

    if (!hourly.has(hourLocal)) {
      hourly.set(hourLocal, {
        hourLocal,
        snapshots: 0,
        totalActiveTrackingKeys: 0,
        maxActiveTrackingKeys: 0,
        linePresence: new Map(),
      })
    }

    const bucket = hourly.get(hourLocal)
    bucket.snapshots += 1
    bucket.totalActiveTrackingKeys += keys.size
    bucket.maxActiveTrackingKeys = Math.max(bucket.maxActiveTrackingKeys, keys.size)

    const activeLinesThisSnapshot = new Map()
    keys.forEach((trackingKey) => {
      const lineRef = trackingKey.split(':')[1]
      activeLinesThisSnapshot.set(lineRef, (activeLinesThisSnapshot.get(lineRef) ?? 0) + 1)
    })

    activeLinesThisSnapshot.forEach((count, lineRef) => {
      if (!bucket.linePresence.has(lineRef)) {
        bucket.linePresence.set(lineRef, {
          totalActive: 0,
          maxActive: 0,
        })
      }

      const lineBucket = bucket.linePresence.get(lineRef)
      lineBucket.totalActive += count
      lineBucket.maxActive = Math.max(lineBucket.maxActive, count)
    })
  })

  return [...hourly.values()]
    .map((bucket) => ({
      hourLocal: bucket.hourLocal,
      snapshots: bucket.snapshots,
      avgActiveTrackingKeys: round(bucket.totalActiveTrackingKeys / bucket.snapshots, 2),
      maxActiveTrackingKeys: bucket.maxActiveTrackingKeys,
      linePresence: Object.fromEntries(
        [...bucket.linePresence.entries()]
          .sort((left, right) => left[0].localeCompare(right[0]))
          .map(([lineRef, value]) => [
            lineRef,
            {
              avgActive: round(value.totalActive / bucket.snapshots, 2),
              maxActive: value.maxActive,
            },
          ]),
      ),
    }))
    .sort((left, right) => left.hourLocal.localeCompare(right.hourLocal))
}

function summarizeTrackingKeys(nearestByTrackingKey, lineMetadata, intervalSeconds) {
  return [...nearestByTrackingKey.entries()]
    .map(([trackingKey, records]) => summarizeTrackingKey(trackingKey, records, lineMetadata, intervalSeconds))
    .sort((left, right) => right.snapshotsObserved - left.snapshotsObserved)
}

function summarizeTrackingKey(trackingKey, records, lineMetadata, intervalSeconds) {
  const [busId, lineRef] = trackingKey.split(':')
  const line = lineMetadata.get(lineRef)
  const segments = splitContinuousSegments(records, intervalSeconds)
  const wrapTimes = collectWrapTimes(segments)
  const loopIntervals = collectLoopIntervals(segments)

  const plateauRuns = collectLowEtaPlateauRunsForRecords(records, intervalSeconds)
  const long24 = plateauRuns.filter((run) => run.polls >= 24)
  const long60 = plateauRuns.filter((run) => run.polls >= 60)

  return {
    trackingKey,
    busId,
    lineRef,
    lineName: line?.name ?? lineRef,
    snapshotsObserved: records.length,
    firstSeenLocal: formatLocalDateTime(records[0]?.capturedAt),
    lastSeenLocal: formatLocalDateTime(records.at(-1)?.capturedAt),
    observationSegmentCount: segments.length,
    wrapsObserved: wrapTimes.length,
    loopIntervalsMinutes: summarizeValues(loopIntervals),
    routeCoverage: {
      visitedStops: new Set(records.map((record) => record.stopId)).size,
      totalStops: line?.stops.length ?? null,
    },
    longestLowEtaPlateau: plateauRuns
      .sort((left, right) => right.durationMinutes - left.durationMinutes)
      .slice(0, 1)[0] ?? null,
    longPlateauRuns24: long24.length,
    longPlateauRuns60: long60.length,
  }
}

function summarizePlateauHotspots(nearestByTrackingKey, intervalSeconds) {
  const runs = [...nearestByTrackingKey.values()].flatMap((records) =>
    collectLowEtaPlateauRunsForRecords(records, intervalSeconds),
  )

  const grouped = new Map()
  runs.forEach((run) => {
    const key = `${run.lineRef}:${run.stopId}:${run.stopName}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key).push(run)
  })

  return [...grouped.entries()]
    .map(([key, groupRuns]) => {
      const [lineRef, stopId, stopName] = key.split(':')
      const long24 = groupRuns.filter((run) => run.polls >= 24)
      const long60 = groupRuns.filter((run) => run.polls >= 60)
      const hourCounts = new Map()

      groupRuns.forEach((run) => {
        const hourLocal = formatLocalHour(run.startAt)
        hourCounts.set(hourLocal, (hourCounts.get(hourLocal) ?? 0) + 1)
      })

      return {
        lineRef,
        stopId,
        stopName,
        totalRuns: groupRuns.length,
        medianRunMinutes: median(groupRuns.map((run) => run.durationMinutes)),
        maxRunMinutes: round(Math.max(...groupRuns.map((run) => run.durationMinutes)), 2),
        longRuns24: long24.length,
        longRuns60: long60.length,
        moveRateWithin15MinutesAfter24: ratio(
          long24.filter((run) => run.minutesUntilNextStop !== null && run.minutesUntilNextStop <= 15).length,
          long24.length,
        ),
        moveRateWithin15MinutesAfter60: ratio(
          long60.filter((run) => run.minutesUntilNextStop !== null && run.minutesUntilNextStop <= 15).length,
          long60.length,
        ),
        busiestStartHoursLocal: [...hourCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 4)
          .map(([hourLocal, count]) => ({ hourLocal, count })),
      }
    })
    .sort((left, right) => {
      if (right.longRuns60 !== left.longRuns60) {
        return right.longRuns60 - left.longRuns60
      }
      if (right.longRuns24 !== left.longRuns24) {
        return right.longRuns24 - left.longRuns24
      }
      return right.totalRuns - left.totalRuns
    })
    .slice(0, 16)
}

function findLineSwitches(snapshots) {
  const byBus = new Map()

  snapshots.forEach((snapshot) => {
    const nearestByBus = new Map()

    snapshot.arrivals.forEach((stationSnapshot) => {
      stationSnapshot.arrivals.forEach((arrival) => {
        const busId = String(arrival.IdBus)
        const minutes = Number(arrival.Minutes)
        const current = nearestByBus.get(busId)

        if (!current || minutes < current.minutes) {
          nearestByBus.set(busId, {
            capturedAt: snapshot.capturedAt,
            lineRef: arrival.LRef,
            stopName: stationSnapshot.station.spName,
            minutes,
          })
        }
      })
    })

    nearestByBus.forEach((entry, busId) => {
      if (!byBus.has(busId)) {
        byBus.set(busId, [])
      }
      byBus.get(busId).push(entry)
    })
  })

  const switches = []

  byBus.forEach((records, busId) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (previous.lineRef !== current.lineRef) {
        switches.push({
          busId,
          fromLineRef: previous.lineRef,
          toLineRef: current.lineRef,
          capturedAt: current.capturedAt,
          capturedAtLocal: formatLocalDateTime(current.capturedAt),
          fromStopName: previous.stopName,
          toStopName: current.stopName,
        })
      }
    }
  })

  return switches
}

function buildNearestTimelineByTrackingKey(snapshots, lineMetadata) {
  const grouped = new Map()

  snapshots.forEach((snapshot) => {
    const nearestByTrackingKey = new Map()

    snapshot.arrivals.forEach((stationSnapshot) => {
      stationSnapshot.arrivals.forEach((arrival) => {
        const trackingKey = `${arrival.IdBus}:${arrival.LRef}`
        const minutes = Number(arrival.Minutes)
        const current = nearestByTrackingKey.get(trackingKey)

        if (!current || minutes < current.minutes) {
          const line = lineMetadata.get(arrival.LRef)
          nearestByTrackingKey.set(trackingKey, {
            capturedAt: snapshot.capturedAt,
            lineRef: arrival.LRef,
            stopId: String(stationSnapshot.station.spRef),
            stopName: stationSnapshot.station.spName,
            lineIndex: line?.indexByStopId.get(String(stationSnapshot.station.spRef)) ?? null,
            minutes,
          })
        }
      })
    })

    nearestByTrackingKey.forEach((entry, trackingKey) => {
      if (!grouped.has(trackingKey)) {
        grouped.set(trackingKey, [])
      }
      grouped.get(trackingKey).push(entry)
    })
  })

  return grouped
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

function collectWrapTimes(segments) {
  const wrapTimes = []

  segments.forEach((records) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (
        previous.lineIndex !== null &&
        current.lineIndex !== null &&
        current.lineIndex < previous.lineIndex
      ) {
        wrapTimes.push(current.capturedAt)
      }
    }
  })

  return wrapTimes
}

function collectLoopIntervals(segments) {
  const intervals = []

  segments.forEach((records) => {
    const segmentWrapTimes = []

    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (
        previous.lineIndex !== null &&
        current.lineIndex !== null &&
        current.lineIndex < previous.lineIndex
      ) {
        segmentWrapTimes.push(current.capturedAt)
      }
    }

    for (let index = 1; index < segmentWrapTimes.length; index += 1) {
      intervals.push((Date.parse(segmentWrapTimes[index]) - Date.parse(segmentWrapTimes[index - 1])) / 60000)
    }
  })

  return intervals
}

function collectLowEtaPlateauRunsForRecords(records, intervalSeconds) {
  const segments = splitContinuousSegments(records, intervalSeconds)
  const runs = []

  segments.forEach((segment) => {
    let index = 0
    while (index < segment.length) {
      const record = segment[index]
      if (record.minutes > 1) {
        index += 1
        continue
      }

      const startIndex = index
      const stopId = record.stopId

      while (index < segment.length && segment[index].stopId === stopId && segment[index].minutes <= 1) {
        index += 1
      }

      const endIndex = index - 1
      const nextRecord = segment[index] ?? null
      runs.push({
        lineRef: record.lineRef,
        stopId,
        stopName: record.stopName,
        startAt: segment[startIndex].capturedAt,
        endAt: segment[endIndex].capturedAt,
        polls: endIndex - startIndex + 1,
        durationMinutes: round(
          (Date.parse(segment[endIndex].capturedAt) - Date.parse(segment[startIndex].capturedAt)) / 60000,
          2,
        ),
        minutesUntilNextStop:
          nextRecord && nextRecord.stopId !== stopId
            ? round((Date.parse(nextRecord.capturedAt) - Date.parse(segment[startIndex].capturedAt)) / 60000, 2)
            : null,
      })
    }
  })

  return runs
}

function splitContinuousSegments(records, intervalSeconds) {
  const segments = []
  const continuityGapMs = Math.max(30_000, intervalSeconds * 2_000)
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

function summarizeValues(values) {
  if (values.length === 0) {
    return {
      count: 0,
      median: null,
      min: null,
      max: null,
    }
  }

  return {
    count: values.length,
    median: median(values),
    min: round(Math.min(...values), 2),
    max: round(Math.max(...values), 2),
  }
}

function formatLocalHour(dateTime) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateTime))

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:00`
}

function formatLocalDateTime(dateTime) {
  if (!dateTime) {
    return null
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateTime))

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
}

function ratio(value, total) {
  if (total === 0) {
    return null
  }

  return round(value / total, 3)
}

function median(values) {
  if (values.length === 0) {
    return null
  }

  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return round((sorted[middle - 1] + sorted[middle]) / 2, 2)
  }

  return round(sorted[middle], 2)
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
