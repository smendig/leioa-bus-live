import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import zlib from 'node:zlib'

const sessionDir = process.argv[2]
const cutoffArg = process.argv.find((argument) => argument.startsWith('--cutoff='))
const cutoff = cutoffArg?.split('=')[1] ?? '2026-06-01T00:00:00.000Z'
const emitPriors = process.argv.includes('--emit-priors')

if (!sessionDir) {
  process.stderr.write(
    'Usage: npm run tracking:validate -- <session-dir> [--cutoff=<ISO date>] [--emit-priors]\n',
  )
  process.exit(1)
}

const manifest = JSON.parse(await fsp.readFile(path.join(sessionDir, 'manifest.json'), 'utf8'))
if (manifest.layout?.type !== 'daily-shards') {
  throw new Error('This validator currently requires a daily-shards capture session')
}

const topology = JSON.parse(await fsp.readFile(path.join(sessionDir, 'topology.json'), 'utf8'))
const lineMetadata = new Map(
  topology.lines.map((line) => {
    const stops = line.Directions?.[0]?.stops ?? []
    return [
      line.LRef,
      {
        stops,
        indexByStop: new Map(stops.map((stop, index) => [String(stop.spRef), index])),
      },
    ]
  }),
)

const timelines = new Map()
const transitions = []
let snapshots = 0

for (const day of Object.keys(manifest.days ?? {}).sort()) {
  const dayDir = path.join(sessionDir, manifest.layout.daysDir, day)
  const fileNames = await fsp.readdir(dayDir)
  const fileName = fileNames.includes('raw.ndjson.gz') ? 'raw.ndjson.gz' : 'raw.ndjson.active'
  let input = fs.createReadStream(path.join(dayDir, fileName))
  if (fileName.endsWith('.gz')) input = input.pipe(zlib.createGunzip())

  for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue
    const snapshot = JSON.parse(line)
    const capturedAt = Date.parse(snapshot.capturedAt)
    const nearestByTrackingKey = new Map()
    snapshots += 1

    for (const poll of snapshot.stopPolls ?? []) {
      if (poll.status !== 'ok' || poll.response?.Error !== '0') continue
      for (const arrival of poll.response?.Arrivals ?? []) {
        const busId = String(arrival.IdBus)
        if (busId === '0') continue
        const lineRef = String(arrival.LRef)
        const trackingKey = `${busId}:${lineRef}`
        const record = {
          capturedAt,
          capturedAtIso: snapshot.capturedAt,
          lineRef,
          stopId: String(poll.spRef),
          minutes: Number(arrival.Minutes),
        }
        const current = nearestByTrackingKey.get(trackingKey)
        if (!current || record.minutes < current.minutes) {
          nearestByTrackingKey.set(trackingKey, record)
        }
      }
    }

    for (const [trackingKey, current] of nearestByTrackingKey) {
      const state = timelines.get(trackingKey)
      if (!state || current.capturedAt - state.last.capturedAt > 30_000) {
        timelines.set(trackingKey, { run: [current], last: current })
        continue
      }

      if (current.stopId === state.last.stopId) {
        state.run.push(current)
      } else {
        collectTransition(state.run, current)
        state.run = [current]
      }
      state.last = current
    }
  }
}

function collectTransition(run, nextRecord) {
  if (run.length === 0) return
  const first = run[0]
  const metadata = lineMetadata.get(first.lineRef)
  const previousIndex = metadata?.indexByStop.get(first.stopId)
  const nextIndex = metadata?.indexByStop.get(nextRecord.stopId)
  const isForward =
    previousIndex !== undefined && nextIndex === (previousIndex + 1) % metadata.stops.length
  if (!isForward || longestExactFreeze(run) >= 10) return

  const seconds = (nextRecord.capturedAt - first.capturedAt) / 1000
  if (seconds <= 0 || seconds > 900) return
  transitions.push({
    key: `${first.lineRef}:${first.stopId}->${nextRecord.stopId}`,
    capturedAt: first.capturedAtIso,
    seconds,
  })
}

function longestExactFreeze(run) {
  let longest = 0
  let current = 0
  let priorMinutes = null
  for (const record of run) {
    current = record.minutes === priorMinutes ? current + 1 : 1
    priorMinutes = record.minutes
    longest = Math.max(longest, current)
  }
  return longest
}

const cutoffTime = Date.parse(cutoff)
if (!Number.isFinite(cutoffTime)) throw new Error(`Invalid cutoff date: ${cutoff}`)
const training = transitions.filter((record) => Date.parse(record.capturedAt) < cutoffTime)
const testing = transitions.filter((record) => Date.parse(record.capturedAt) >= cutoffTime)
const trainedPriors = summarizeByKey(training)
const trainedStopPairPriors = summarizeByKey(
  training.map((record) => ({ ...record, key: getStopPairKey(record.key) })),
)
const configuredPriors = await readConfiguredPriors()

const report = {
  source: {
    sessionId: manifest.sessionId,
    snapshots,
    transitions: transitions.length,
    cutoff,
    trainingTransitions: training.length,
    testingTransitions: testing.length,
  },
  evaluation: [
    scoreModel(
      'configured-line-segment-priors',
      testing,
      (record) => configuredPriors.get(record.key)?.medianSeconds,
    ),
    scoreModel(
      'training-only-stop-pair-medians',
      testing,
      (record) => trainedStopPairPriors.get(getStopPairKey(record.key))?.medianSeconds,
    ),
    scoreModel(
      'training-only-line-segment-medians',
      testing,
      (record) => trainedPriors.get(record.key)?.medianSeconds,
    ),
  ],
  configuredPriorsNote:
    'Configured priors may include post-cutoff observations; use training-only results for a strict holdout comparison.',
  configuredCoverage: ratio(
    testing.filter((record) => configuredPriors.has(record.key)).length,
    testing.length,
  ),
  trainedCoverage: ratio(
    testing.filter((record) => trainedPriors.has(record.key)).length,
    testing.length,
  ),
  missingConfiguredKeys: [
    ...new Set(
      testing.filter((record) => !configuredPriors.has(record.key)).map((record) => record.key),
    ),
  ].sort(),
}

if (emitPriors) {
  report.trainingPriors = Object.fromEntries(
    [...trainedPriors].sort(([left], [right]) => left.localeCompare(right)),
  )
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

function summarizeByKey(records) {
  const grouped = new Map()
  for (const record of records) {
    if (!grouped.has(record.key)) grouped.set(record.key, [])
    grouped.get(record.key).push(record.seconds)
  }
  return new Map(
    [...grouped].map(([key, values]) => [
      key,
      {
        sampleSize: values.length,
        p10Seconds: round(quantile(values, 0.1)),
        medianSeconds: round(quantile(values, 0.5)),
        p90Seconds: round(quantile(values, 0.9)),
      },
    ]),
  )
}

async function readConfiguredPriors() {
  const source = await fsp.readFile('src/config/segmentPriors.ts', 'utf8')
  const expression =
    /'([^']+)':\s*\{\s*sampleSize:\s*(\d+),\s*p10Seconds:\s*([\d.]+),\s*medianSeconds:\s*([\d.]+),\s*p90Seconds:\s*([\d.]+),?\s*\}/g
  const priors = new Map()
  for (const match of source.matchAll(expression)) {
    priors.set(match[1], {
      sampleSize: Number(match[2]),
      p10Seconds: Number(match[3]),
      medianSeconds: Number(match[4]),
      p90Seconds: Number(match[5]),
    })
  }
  return priors
}

function scoreModel(name, records, predict) {
  const errors = []
  for (const record of records) {
    const prediction = predict(record)
    if (Number.isFinite(prediction)) errors.push(Math.abs(record.seconds - prediction))
  }
  return {
    name,
    evaluatedTransitions: errors.length,
    meanAbsoluteErrorSeconds: round(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    medianAbsoluteErrorSeconds: round(quantile(errors, 0.5)),
    p90AbsoluteErrorSeconds: round(quantile(errors, 0.9)),
  }
}

function quantile(values, percentile) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - 1) * percentile)]
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000
}

function getStopPairKey(lineSegmentKey) {
  return lineSegmentKey.slice(lineSegmentKey.indexOf(':') + 1)
}

function round(value) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100
}
