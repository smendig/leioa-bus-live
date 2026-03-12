import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_THRESHOLDS = [12, 24, 40, 60]
const MOVE_WINDOWS_MINUTES = [5, 10, 15, 30]

const args = parseArgs(process.argv.slice(2))
const inputs = (args.input ? [args.input] : await findDefaultSessions()).map((input) => path.resolve(input))

if (inputs.length === 0) {
  process.stderr.write('Usage: node scripts/research-tracking-heuristics.mjs --input <session-dir-or-manifest>\n')
  process.exit(1)
}

const sessions = await Promise.all(inputs.map(loadCapture))
const thresholds = parseNumberList(args.thresholds, DEFAULT_THRESHOLDS)
const summary = summarizeSessions(sessions, thresholds)

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

async function findDefaultSessions() {
  const sessionsRoot = path.resolve('captures/sessions')

  try {
    const entries = await fs.readdir(sessionsRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(sessionsRoot, entry.name))
      .sort()
  } catch {
    return []
  }
}

function parseNumberList(value, fallback) {
  if (!value) {
    return fallback
  }

  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function summarizeSessions(sessions, thresholds) {
  const sources = sessions.map((session) => ({
    sessionId: session.meta.sessionId,
    status: session.meta.status,
    completedSnapshots: session.meta.completedSnapshots,
    firstCaptureAt: session.snapshots[0]?.capturedAt ?? null,
    lastCaptureAt: session.snapshots.at(-1)?.capturedAt ?? null,
  }))

  const allRuns = []
  const allLineSwitches = []
  const byLineStop = new Map()

  sessions.forEach((session) => {
    const sessionRuns = collectLowEtaPlateauRuns(session)
    sessionRuns.forEach((run) => {
      allRuns.push(run)

      const lineStopKey = `${run.lineRef}:${run.stopId}:${run.stopName}`
      if (!byLineStop.has(lineStopKey)) {
        byLineStop.set(lineStopKey, [])
      }
      byLineStop.get(lineStopKey).push(run)
    })

    allLineSwitches.push(...findLineSwitches(session))
  })

  return {
    sources,
    lowEtaPlateauResearch: {
      thresholds,
      windowsMinutes: MOVE_WINDOWS_MINUTES,
      overall: summarizeRuns(allRuns, thresholds),
      topHotspots: summarizeHotspots(byLineStop),
    },
    lineSwitches: {
      total: allLineSwitches.length,
      events: allLineSwitches,
    },
  }
}

function collectLowEtaPlateauRuns(session) {
  const intervalSeconds = session.meta.intervalSeconds ?? 15
  const byBus = buildNearestTimelineByBus(session.snapshots)
  const runs = []

  byBus.forEach((records, busId) => {
    const segments = splitContinuousSegments(records, intervalSeconds)

    segments.forEach((segment) => {
      let index = 0
      while (index < segment.length) {
        const record = segment[index]
        if (!isLowEta(record)) {
          index += 1
          continue
        }

        const startIndex = index
        const stopId = record.stopId
        const stopName = record.stopName

        while (
          index < segment.length &&
          segment[index].stopId === stopId &&
          isLowEta(segment[index])
        ) {
          index += 1
        }

        const endIndex = index - 1
        const nextRecord = segment[index] ?? null

        runs.push({
          sessionId: session.meta.sessionId,
          busId,
          lineRef: record.lineRef,
          stopId,
          stopName,
          startAt: segment[startIndex].capturedAt,
          endAt: segment[endIndex].capturedAt,
          polls: endIndex - startIndex + 1,
          durationMinutes: round(
            (Date.parse(segment[endIndex].capturedAt) - Date.parse(segment[startIndex].capturedAt)) / 60000,
            2,
          ),
          nextStopId: nextRecord?.stopId ?? null,
          nextStopName: nextRecord?.stopName ?? null,
          movesAfterRun: Boolean(nextRecord && nextRecord.stopId !== stopId),
          minutesUntilNextStop:
            nextRecord && nextRecord.stopId !== stopId
              ? round((Date.parse(nextRecord.capturedAt) - Date.parse(segment[startIndex].capturedAt)) / 60000, 2)
              : null,
          intervalSeconds,
        })
      }
    })
  })

  return runs
}

function summarizeRuns(runs, thresholds) {
  return {
    totalRuns: runs.length,
    lineBreakdown: summarizeRunsByGroup(runs, (run) => run.lineRef, thresholds),
    thresholdOutcomes: thresholds.map((threshold) => summarizeThresholdOutcome(runs, threshold)),
  }
}

function summarizeRunsByGroup(runs, getGroupKey, thresholds) {
  const grouped = new Map()

  runs.forEach((run) => {
    const key = getGroupKey(run)
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key).push(run)
  })

  return [...grouped.entries()]
    .map(([key, groupRuns]) => ({
      key,
      runCount: groupRuns.length,
      thresholdOutcomes: thresholds.map((threshold) => summarizeThresholdOutcome(groupRuns, threshold)),
    }))
    .sort((left, right) => right.runCount - left.runCount)
}

function summarizeThresholdOutcome(runs, thresholdPolls) {
  const eligibleRuns = runs.filter((run) => run.polls >= thresholdPolls)
  const movedRuns = eligibleRuns.filter((run) => run.movesAfterRun && run.minutesUntilNextStop !== null)

  return {
    thresholdPolls,
    thresholdMinutes: round((thresholdPolls * (eligibleRuns[0]?.intervalSeconds ?? 15)) / 60, 2),
    eligibleRuns: eligibleRuns.length,
    moveRateAnytime: ratio(movedRuns.length, eligibleRuns.length),
    moveRateByWindow: Object.fromEntries(
      MOVE_WINDOWS_MINUTES.map((windowMinutes) => [
        String(windowMinutes),
        ratio(
          eligibleRuns.filter(
            (run) => run.movesAfterRun && run.minutesUntilNextStop !== null && run.minutesUntilNextStop <= windowMinutes,
          ).length,
          eligibleRuns.length,
        ),
      ]),
    ),
    medianMinutesUntilMove: median(
      movedRuns
        .map((run) => run.minutesUntilNextStop)
        .filter((value) => value !== null),
    ),
    sampleRuns: eligibleRuns.slice(0, 5).map((run) => ({
      sessionId: run.sessionId,
      busId: run.busId,
      lineRef: run.lineRef,
      stopName: run.stopName,
      polls: run.polls,
      durationMinutes: run.durationMinutes,
      movesAfterRun: run.movesAfterRun,
      minutesUntilNextStop: run.minutesUntilNextStop,
      nextStopName: run.nextStopName,
    })),
  }
}

function summarizeHotspots(byLineStop) {
  return [...byLineStop.entries()]
    .map(([key, runs]) => {
      const [lineRef, stopId, stopName] = key.split(':')
      const threshold60 = summarizeThresholdOutcome(runs, 60)
      const threshold24 = summarizeThresholdOutcome(runs, 24)

      return {
        lineRef,
        stopId,
        stopName,
        runCount: runs.length,
        medianRunMinutes: median(runs.map((run) => run.durationMinutes)),
        maxRunMinutes: round(Math.max(...runs.map((run) => run.durationMinutes)), 2),
        moveRateAfter24Polls: threshold24.moveRateAnytime,
        moveRateWithin15MinutesAfter24Polls: threshold24.moveRateByWindow['15'],
        moveRateAfter60Polls: threshold60.moveRateAnytime,
        moveRateWithin15MinutesAfter60Polls: threshold60.moveRateByWindow['15'],
      }
    })
    .sort((left, right) => right.runCount - left.runCount)
    .slice(0, 12)
}

function findLineSwitches(session) {
  const byBus = buildNearestTimelineByBus(session.snapshots)
  const switches = []

  byBus.forEach((records, busId) => {
    for (let index = 1; index < records.length; index += 1) {
      const previous = records[index - 1]
      const current = records[index]

      if (previous.lineRef !== current.lineRef) {
        switches.push({
          sessionId: session.meta.sessionId,
          busId,
          fromLineRef: previous.lineRef,
          toLineRef: current.lineRef,
          capturedAt: current.capturedAt,
          fromStopName: previous.stopName,
          toStopName: current.stopName,
        })
      }
    }
  })

  return switches
}

function buildNearestTimelineByBus(snapshots) {
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
            stopId: String(stationSnapshot.station.spRef),
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

  return byBus
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

function isLowEta(record) {
  return record.minutes <= 1
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
