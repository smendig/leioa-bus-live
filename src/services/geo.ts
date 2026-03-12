import polyline from '@mapbox/polyline'
import * as turf from '@turf/turf'
import type { Feature, LineString, MultiLineString, Position } from 'geojson'
import { BUS_SPEED_KM_PER_MINUTE } from '../config/transit'
import type { LngLat } from '../types/transit'
import type { BusRenderState, ResolvedBusSegment } from '../types/tracking'

export type RouteLine = Feature<LineString>
export type DisplayGeometry = Feature<MultiLineString>

export function decodeLineGeometry(encodedStr: string): RouteLine {
  const decodedPath = polyline.decode(encodedStr) as [number, number][]
  const geoJsonCoordinates: LngLat[] = decodedPath.map(([lat, lng]: [number, number]) => [lng, lat])

  return turf.lineString(geoJsonCoordinates)
}

export function getDisplayGeometry(encodedStr: string): DisplayGeometry {
  const decodedPath = polyline.decode(encodedStr) as [number, number][]
  const coords: LngLat[] = decodedPath.map(([lat, lng]: [number, number]) => [lng, lat])

  if (coords.length < 2) {
    return turf.multiLineString([])
  }

  let currentLine: LngLat[] = [coords[0]]
  const multiCoords: Position[][] = []

  for (let i = 1; i < coords.length; i += 1) {
    const pt1 = turf.point(coords[i - 1])
    const pt2 = turf.point(coords[i])
    const distanceKm = turf.distance(pt1, pt2, { units: 'kilometers' })

    if (distanceKm > 0.15) {
      if (currentLine.length > 1) {
        multiCoords.push(currentLine)
      }
      currentLine = [coords[i]]
    } else {
      currentLine.push(coords[i])
    }
  }

  if (currentLine.length > 1) {
    multiCoords.push(currentLine)
  }

  return turf.multiLineString(multiCoords)
}

export function calculateBusPosition(
  lineString: RouteLine,
  nextStopCoords: LngLat,
  minutesAway: number,
): LngLat | null {
  if (minutesAway < 0) {
    return null
  }

  const stopPoint = turf.point(nextStopCoords)
  const snappedStop = turf.nearestPointOnLine(lineString, stopPoint)
  const estDistanceKm = minutesAway * BUS_SPEED_KM_PER_MINUTE
  const distanceToStop = Number(snappedStop.properties.location ?? 0)

  let busDistanceAlongLine = distanceToStop - estDistanceKm
  if (busDistanceAlongLine < 0) {
    busDistanceAlongLine = 0
  }

  const syntheticPosition = turf.along(lineString, busDistanceAlongLine)
  const [lng, lat] = syntheticPosition.geometry.coordinates

  return [lng, lat]
}

export function calculateBusPositionOnSegment(
  lineString: RouteLine,
  previousStopCoords: LngLat,
  nextStopCoords: LngLat,
  progressRatio: number,
): LngLat | null {
  const clampedProgress = Math.min(1, Math.max(0, progressRatio))
  const totalLineLength = turf.length(lineString, { units: 'kilometers' })
  if (totalLineLength <= 0) {
    return null
  }

  const previousStopPoint = turf.point(previousStopCoords)
  const nextStopPoint = turf.point(nextStopCoords)
  const previousSnap = turf.nearestPointOnLine(lineString, previousStopPoint)
  const nextSnap = turf.nearestPointOnLine(lineString, nextStopPoint)

  const previousDistance = Number(previousSnap.properties.location ?? 0)
  const nextDistance = Number(nextSnap.properties.location ?? 0)

  const isWrappedSegment = nextDistance < previousDistance
  const segmentLength = isWrappedSegment
    ? totalLineLength - previousDistance + nextDistance
    : nextDistance - previousDistance

  if (segmentLength <= 0) {
    return nextStopCoords
  }

  let targetDistance = previousDistance + segmentLength * clampedProgress
  if (targetDistance > totalLineLength) {
    targetDistance -= totalLineLength
  }

  const syntheticPosition = turf.along(lineString, targetDistance, { units: 'kilometers' })
  const [lng, lat] = syntheticPosition.geometry.coordinates

  return [lng, lat]
}

export function resolveMarkerPosition(
  renderState: BusRenderState,
  routeLine: RouteLine,
  resolvedSegment: ResolvedBusSegment | null,
  fallbackNextStopPosition: LngLat,
  segmentProgress: number,
): LngLat {
  if (renderState === 'holding' || !resolvedSegment) {
    return fallbackNextStopPosition
  }

  return (
    calculateBusPositionOnSegment(
      routeLine,
      resolvedSegment.previousStop.position,
      resolvedSegment.nextStop.position,
      segmentProgress,
    ) ?? fallbackNextStopPosition
  )
}
