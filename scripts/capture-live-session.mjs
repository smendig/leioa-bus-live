import fs from 'node:fs/promises'
import path from 'node:path'
import { fetchAllArrivals, fetchTopology } from './lib/ingenia-api.mjs'

const args = parseArgs(process.argv.slice(2))
const sessionsDir = path.resolve(args.outputDir ?? 'captures/sessions')
const intervalSeconds = Number(args.interval ?? 15)
const durationSeconds = args.duration ? Number(args.duration) : null
const maxSnapshots = args.maxSnapshots ? Number(args.maxSnapshots) : null
const resumeTarget = args.resume ?? null

let stopRequested = false

process.on('SIGINT', () => {
  stopRequested = true
})

process.on('SIGTERM', () => {
  stopRequested = true
})

await fs.mkdir(sessionsDir, { recursive: true })

const session = resumeTarget
  ? await loadExistingSession(sessionsDir, resumeTarget)
  : await createSession(sessionsDir, intervalSeconds)

const runStartedAt = new Date()
const runDeadline = durationSeconds === null ? null : Date.now() + durationSeconds * 1000

await appendEvent(session.paths.events, {
  type: 'run_started',
  at: runStartedAt.toISOString(),
  intervalSeconds,
  durationSeconds,
  maxSnapshots,
})

session.manifest.status = 'running'
session.manifest.updatedAt = runStartedAt.toISOString()
await writeManifest(session.paths.manifest, session.manifest)

let snapshotsCapturedThisRun = 0

while (!stopRequested) {
  if (runDeadline !== null && Date.now() >= runDeadline) {
    break
  }

  if (maxSnapshots !== null && snapshotsCapturedThisRun >= maxSnapshots) {
    break
  }

  const capturedAt = new Date()

  try {
    const arrivals = await fetchAllArrivals(session.topology.stations)

    await appendSnapshot(session.paths.snapshots, {
      capturedAt: capturedAt.toISOString(),
      arrivals,
    })

    session.manifest.completedSnapshots += 1
    session.manifest.lastCaptureAt = capturedAt.toISOString()
    session.manifest.updatedAt = capturedAt.toISOString()
    session.manifest.totalStopPolls += arrivals.length
    snapshotsCapturedThisRun += 1

    await writeManifest(session.paths.manifest, session.manifest)

    process.stdout.write(
      `[${session.manifest.sessionId}] captured snapshot ${session.manifest.completedSnapshots} at ${capturedAt.toISOString()}\n`,
    )
  } catch (error) {
    const failedAt = new Date().toISOString()
    session.manifest.failedPolls += 1
    session.manifest.updatedAt = failedAt

    await appendEvent(session.paths.events, {
      type: 'capture_error',
      at: failedAt,
      message: error instanceof Error ? error.message : String(error),
    })

    await writeManifest(session.paths.manifest, session.manifest)

    process.stderr.write(
      `[${session.manifest.sessionId}] capture error at ${failedAt}: ${error instanceof Error ? error.message : String(error)}\n`,
    )
  }

  if (stopRequested) {
    break
  }

  if (runDeadline !== null && Date.now() >= runDeadline) {
    break
  }

  if (maxSnapshots !== null && snapshotsCapturedThisRun >= maxSnapshots) {
    break
  }

  await delay(intervalSeconds * 1000)
}

const finishedAt = new Date().toISOString()
session.manifest.status = stopRequested ? 'stopped' : 'idle'
session.manifest.updatedAt = finishedAt

await appendEvent(session.paths.events, {
  type: stopRequested ? 'run_stopped' : 'run_completed',
  at: finishedAt,
  snapshotsCapturedThisRun,
})

await writeManifest(session.paths.manifest, session.manifest)

process.stdout.write(
  `Session ${session.manifest.sessionId} saved in ${session.paths.dir}\nResume with: npm run capture:session -- --resume ${session.manifest.sessionId}\n`,
)

async function createSession(rootDir, interval) {
  const sessionId = buildSessionId(new Date())
  const dir = path.join(rootDir, sessionId)

  await fs.mkdir(dir, { recursive: true })

  const topology = await fetchTopology()
  const manifest = {
    version: 1,
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'idle',
    intervalSeconds: interval,
    completedSnapshots: 0,
    failedPolls: 0,
    totalStopPolls: 0,
    lastCaptureAt: null,
    files: {
      topology: 'topology.json',
      snapshots: 'snapshots.ndjson',
      events: 'events.ndjson',
    },
  }

  const paths = buildPaths(dir, manifest.files)
  await fs.writeFile(paths.topology, JSON.stringify(topology, null, 2))
  await fs.writeFile(paths.snapshots, '')
  await fs.writeFile(paths.events, '')
  await writeManifest(paths.manifest, manifest)

  return {
    manifest,
    topology,
    paths: {
      ...paths,
      dir,
    },
  }
}

async function loadExistingSession(rootDir, resumeValue) {
  const dir = await resolveSessionDir(rootDir, resumeValue)
  const manifestPath = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const paths = buildPaths(dir, manifest.files)
  const topology = JSON.parse(await fs.readFile(paths.topology, 'utf8'))

  return {
    manifest,
    topology,
    paths: {
      ...paths,
      dir,
    },
  }
}

async function resolveSessionDir(rootDir, resumeValue) {
  const explicitPath = path.resolve(resumeValue)

  try {
    const stat = await fs.stat(explicitPath)
    if (stat.isDirectory()) {
      return explicitPath
    }

    if (stat.isFile()) {
      return path.dirname(explicitPath)
    }
  } catch {
    return path.join(rootDir, resumeValue)
  }

  return path.join(rootDir, resumeValue)
}

function buildPaths(dir, files) {
  return {
    manifest: path.join(dir, 'manifest.json'),
    topology: path.join(dir, files.topology),
    snapshots: path.join(dir, files.snapshots),
    events: path.join(dir, files.events),
  }
}

async function appendSnapshot(filePath, snapshot) {
  await fs.appendFile(filePath, `${JSON.stringify(snapshot)}\n`)
}

async function appendEvent(filePath, event) {
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`)
}

async function writeManifest(filePath, manifest) {
  const tempPath = `${filePath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2))
  await fs.rename(tempPath, filePath)
}

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

function buildSessionId(date) {
  return `session-${date.toISOString().replaceAll(':', '-').replaceAll('.', '-')}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
