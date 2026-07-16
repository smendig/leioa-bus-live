import type { Line, LineStop, Station, Topology } from '../types/transit'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  )
}

function isStation(value: unknown): value is Station {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lng) &&
    isPosition(value.position)
  )
}

function isLineStop(value: unknown): value is LineStop {
  if (!isStation(value) || !isRecord(value)) return false
  return typeof value.sequence === 'number' && Number.isInteger(value.sequence)
}

function isLine(value: unknown): value is Line {
  if (!isRecord(value)) return false
  return (
    typeof value.ref === 'string' &&
    typeof value.name === 'string' &&
    typeof value.encodedPath === 'string' &&
    Array.isArray(value.stops) &&
    value.stops.length > 0 &&
    value.stops.every(isLineStop)
  )
}

export function isTopology(value: unknown): value is Topology {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.lines) &&
    value.lines.length > 0 &&
    value.lines.every(isLine) &&
    Array.isArray(value.stations) &&
    value.stations.length > 0 &&
    value.stations.every(isStation)
  )
}
