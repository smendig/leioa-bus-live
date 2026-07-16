import type { RouteLine } from '../services/geo'
import type { Arrival, Line, LineStop, Station } from './transit'

export type LineWithGeometry = Line & {
  geoJson: RouteLine
}

export interface BusPrediction {
  station: Station
  minutes: number
  lineRef: string
}

export interface ActiveBusGroup {
  trackingKey: string
  busId: string
  lineRef: string
  predictions: BusPrediction[]
}

export type BusRenderState = 'moving' | 'holding' | 'ambiguous'
export type BusConfidenceLabel = 'high' | 'medium' | 'low'
export type PredictionSuppressionReason = 'stale_prediction'

export interface InterpolationState {
  targetStationId: string
  segmentEnteredAt: number
  lastPredictionChangedAt: number
  lastReportedMinutes: number
  progressRatio: number
}

export interface PredictionHistoryState {
  pollsObserved: number
  stationChanges: number
  repeatedPolls: number
  lastMinutes: number
  lastStationId: string
  sameStopPolls: number
  lowEtaPlateauPolls: number
  sameStopEtaIncreaseCount: number
  largeEtaJumpCount: number
}

export interface StationArrivals {
  station: Station
  arrivals: Arrival[]
  isSuccessful: boolean
}

export interface ResolvedBusSegment {
  previousStop: LineStop
  nextStop: LineStop
  estimatedSegmentMinutes: number
  p10SegmentMinutes: number
  p90SegmentMinutes: number
  priorSampleSize: number
  priorSource: 'line-segment' | 'live-adjacent' | 'fallback'
}

export interface BusTrackingDiagnostic {
  trackingKey: string
  busId: string
  lineRef: string
  lineName: string
  previousStopName: string
  nextStopName: string
  renderState: BusRenderState
  pollsObserved: number
  stationChanges: number
  minutesToNextStop: number
  estimatedSegmentMinutes: number
  progressRatio: number
  segmentElapsedSeconds: number
  predictionAgeSeconds: number
  p10SegmentMinutes: number
  p90SegmentMinutes: number
  priorSampleSize: number
  priorSource: ResolvedBusSegment['priorSource']
  repeatedPolls: number
  sameStopPolls: number
  lowEtaPlateauPolls: number
  sameStopEtaIncreaseCount: number
  largeEtaJumpCount: number
  routeGapCount: number
  confidenceScore: number
  confidenceLabel: BusConfidenceLabel
  routeContinuityScore: number
  etaStabilityScore: number
  plateauScore: number
  contextScore: number
  freshnessScore: number
  sameStopOverlapCount: number
  lowEtaSameStopOverlapCount: number
  isStaleCandidate: boolean
  isSuppressed: boolean
  suppressionReason: PredictionSuppressionReason | null
}
