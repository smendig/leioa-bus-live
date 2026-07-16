import polyline from '@mapbox/polyline'
import {
  along,
  distance,
  length,
  lineString,
  multiLineString,
  nearestPointOnLine,
  point,
} from '@turf/turf'
import type { Feature, LineString, MultiLineString, Position } from 'geojson'

import type { BusRenderState, ResolvedBusSegment } from '../types/tracking'
import type { LngLat } from '../types/transit'

export type RouteLine = Feature<LineString>
export type DisplayGeometry = Feature<MultiLineString>

export function decodeLineGeometry(encodedStr: string): RouteLine {
  const decodedPath = polyline.decode(encodedStr) as [number, number][]
  const geoJsonCoordinates: LngLat[] = decodedPath.map(([lat, lng]: [number, number]) => [lng, lat])

  return lineString(geoJsonCoordinates)
}

export function getDisplayGeometry(encodedStr: string): DisplayGeometry {
  const decodedPath = polyline.decode(encodedStr) as [number, number][]
  const coords: LngLat[] = decodedPath.map(([lat, lng]: [number, number]) => [lng, lat])

  if (coords.length < 2) {
    return multiLineString([])
  }

  let currentLine: LngLat[] = [coords[0]]
  const multiCoords: Position[][] = []

  for (let i = 1; i < coords.length; i += 1) {
    const pt1 = point(coords[i - 1])
    const pt2 = point(coords[i])
    const distanceKm = distance(pt1, pt2, { units: 'kilometers' })

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

  return multiLineString(multiCoords)
}

export function calculateBusPositionOnSegment(
  lineString: RouteLine,
  previousStopCoords: LngLat,
  nextStopCoords: LngLat,
  progressRatio: number,
): LngLat | null {
  const clampedProgress = Math.min(1, Math.max(0, progressRatio))
  const totalLineLength = length(lineString, { units: 'kilometers' })
  if (totalLineLength <= 0) {
    return null
  }

  const previousStopPoint = point(previousStopCoords)
  const nextStopPoint = point(nextStopCoords)
  const previousSnap = nearestPointOnLine(lineString, previousStopPoint)
  const nextSnap = nearestPointOnLine(lineString, nextStopPoint)

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

  const syntheticPosition = along(lineString, targetDistance, { units: 'kilometers' })
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
