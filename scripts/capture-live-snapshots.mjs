import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchAllArrivals, fetchTopology } from './lib/ingenia-api.mjs'

const args = parseArgs(process.argv.slice(2))
const durationSeconds = Number(args.duration ?? 300)
const intervalSeconds = Number(args.interval ?? 15)
const outputDir = path.resolve(args.outputDir ?? 'captures')

const topology = await fetchTopology()
const startedAt = new Date()
const iterations = Math.max(1, Math.ceil(durationSeconds / intervalSeconds))
const snapshots = []

await fs.mkdir(outputDir, { recursive: true })

for (let index = 0; index < iterations; index += 1) {
  const iterationStartedAt = new Date()
  const arrivals = await fetchAllArrivals(topology.stations)

  snapshots.push({
    capturedAt: iterationStartedAt.toISOString(),
    arrivals,
  })

  process.stdout.write(
    `[${index + 1}/${iterations}] captured ${arrivals.length} stops at ${iterationStartedAt.toISOString()}\n`,
  )

  if (index < iterations - 1) {
    await delay(intervalSeconds * 1000)
  }
}

const endedAt = new Date()
const outputPath = path.join(outputDir, buildFilename(startedAt))

await fs.writeFile(
  outputPath,
  JSON.stringify(
    {
      meta: {
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        intervalSeconds,
        iterations,
      },
      topology,
      snapshots,
    },
    null,
    2,
  ),
)

process.stdout.write(`Saved capture to ${outputPath}\n`)

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

function buildFilename(date) {
  const safe = date.toISOString().replaceAll(':', '-')
  return `live-capture-${safe}.json`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
