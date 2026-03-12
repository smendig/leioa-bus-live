import fs from 'node:fs/promises'
import path from 'node:path'

const args = parseArgs(process.argv.slice(2))
const inputPath = args.input

if (!inputPath) {
  process.stderr.write('Usage: npm run analyze:live -- --input <capture-file>\n')
  process.exit(1)
}

const capture = await loadCapture(path.resolve(inputPath))
const lineStopOrders = buildLineStopOrders(capture.topology.lines)
const timeline = buildBusTimeline(capture.snapshots)
const summary = summarizeTimeline(timeline, lineStopOrders)

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

function buildLineStopOrders(lines) {
  return Object.fromEntries(
    lines.map((line) => [
      line.LRef,
      (line.Directions?.[0]?.stops ?? []).map((stop, index) => ({
        index,
        spRef: String(stop.spRef),
        spName: stop.spName,
      })),
    ]),
  )
}

function buildBusTimeline(snapshots) {
  const timeline = new Map()

  snapshots.forEach((snapshot) => {
    snapshot.arrivals.forEach((stationSnapshot) => {
      stationSnapshot.arrivals.forEach((arrival) => {
        const busId = String(arrival.IdBus)

        if (!timeline.has(busId)) {
          timeline.set(busId, [])
        }

        timeline.get(busId).push({
          capturedAt: snapshot.capturedAt,
          station: stationSnapshot.station,
          arrival,
        })
      })
    })
  })

  return timeline
}

function summarizeTimeline(timeline, lineStopOrders) {
  const buses = [...timeline.entries()].map(([busId, entries]) => {
    const snapshots = groupEntriesByCapture(entries)
    const sequence = snapshots.map((snapshot) => {
      const sortedArrivals = snapshot.entries
        .map((entry) => ({
          spRef: String(entry.station.spRef),
          spName: entry.station.spName,
          minutes: Number(entry.arrival.Minutes),
          lineRef: entry.arrival.LRef,
        }))
        .sort((left, right) => left.minutes - right.minutes)

      const nearest = sortedArrivals[0] ?? null
      const lineOrder = nearest ? lineStopOrders[nearest.lineRef] ?? [] : []
      const lineIndex = nearest
        ? lineOrder.find((stop) => stop.spRef === nearest.spRef)?.index ?? null
        : null

      return {
        capturedAt: snapshot.capturedAt,
        arrivalsCount: sortedArrivals.length,
        nearest,
        lineIndex,
        etaDeltas: buildAdjacentDeltas(sortedArrivals, lineOrder),
      }
    })

    const nearestLineRef = sequence.find((snapshot) => snapshot.nearest)?.nearest?.lineRef ?? null

    return {
      busId,
      totalEntries: entries.length,
      snapshotsObserved: sequence.length,
      lineRef: nearestLineRef,
      nearestStopsOverTime: sequence.map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        nearest: snapshot.nearest,
        lineIndex: snapshot.lineIndex,
      })),
      adjacentEtaDeltas: summarizeDeltas(sequence.flatMap((snapshot) => snapshot.etaDeltas)),
    }
  })

  return {
    meta: captureMeta(timeline),
    buses,
  }
}

function groupEntriesByCapture(entries) {
  const grouped = new Map()

  entries.forEach((entry) => {
    if (!grouped.has(entry.capturedAt)) {
      grouped.set(entry.capturedAt, [])
    }

    grouped.get(entry.capturedAt).push(entry)
  })

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([capturedAt, groupedEntries]) => ({
      capturedAt,
      entries: groupedEntries,
    }))
}

function buildAdjacentDeltas(sortedArrivals, lineOrder) {
  const deltas = []

  for (let index = 0; index < sortedArrivals.length - 1; index += 1) {
    const current = sortedArrivals[index]
    const next = sortedArrivals[index + 1]
    const currentOrder = lineOrder.find((stop) => stop.spRef === current.spRef)?.index
    const nextOrder = lineOrder.find((stop) => stop.spRef === next.spRef)?.index

    if (currentOrder === undefined || nextOrder === undefined) {
      continue
    }

    deltas.push({
      fromStop: current.spName,
      toStop: next.spName,
      fromIndex: currentOrder,
      toIndex: nextOrder,
      minuteDelta: next.minutes - current.minutes,
      isAdjacent: areAdjacent(currentOrder, nextOrder, lineOrder.length),
    })
  }

  return deltas
}

function areAdjacent(currentIndex, nextIndex, total) {
  if (total === 0) {
    return false
  }

  return ((currentIndex + 1) % total) === nextIndex
}

function summarizeDeltas(deltas) {
  const adjacent = deltas.filter((delta) => delta.isAdjacent)
  const averageMinuteDelta =
    adjacent.length === 0
      ? null
      : adjacent.reduce((sum, delta) => sum + delta.minuteDelta, 0) / adjacent.length

  return {
    totalPairs: deltas.length,
    adjacentPairs: adjacent.length,
    averageMinuteDelta,
    samples: deltas.slice(0, 10),
  }
}

function captureMeta(timeline) {
  return {
    activeBusCount: timeline.size,
  }
}

async function loadCapture(resolvedInputPath) {
  const stat = await fs.stat(resolvedInputPath)

  if (stat.isDirectory()) {
    return loadSessionCapture(resolvedInputPath)
  }

  const payload = JSON.parse(await fs.readFile(resolvedInputPath, 'utf8'))
  if (Array.isArray(payload.snapshots)) {
    return payload
  }

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
