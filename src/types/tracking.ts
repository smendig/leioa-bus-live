import type { Arrival, Line, LineStop, Station } from './transit'
import type { RouteLine } from '../services/geo'

export type LineWithGeometry = Line & {
  geoJson: RouteLine
}

export type BusPrediction = {
  station: Station
  minutes: number
  lineRef: string
}

export type ActiveBusGroup = {
  trackingKey: string
  busId: string
  lineRef: string
  predictions: BusPrediction[]
}

export type BusRenderState = 'moving' | 'holding' | 'ambiguous'
export type BusConfidenceLabel = 'high' | 'medium' | 'low'
export type GhostSuppressionReason = 'elapsed_timeout' | 'low_eta_plateau'

export type GhostBusState = {
  minutes: number
  stationId: string
  reason: GhostSuppressionReason
}

export type InterpolationState = {
  reportedMinutes: number
  targetStationId: string
  localStartTime: number
}

export type PredictionHistoryState = {
  repeatedPolls: number
  lastMinutes: number
  lastStationId: string
  sameStopPolls: number
  lowEtaPlateauPolls: number
  sameStopEtaIncreaseCount: number
  largeEtaJumpCount: number
}

export type StationArrivals = {
  station: Station
  arrivals: Arrival[]
}

export type ResolvedBusSegment = {
  previousStop: LineStop
  nextStop: LineStop
  estimatedSegmentMinutes: number
}

export type BusTrackingDiagnostic = {
  trackingKey: string
  busId: string
  lineName: string
  previousStopName: string
  nextStopName: string
  renderState: BusRenderState
  minutesToNextStop: number
  estimatedSegmentMinutes: number
  progressRatio: number
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
  hotspotLabel: string | null
  hotspotPenalty: number
  sameStopOverlapCount: number
  lowEtaSameStopOverlapCount: number
  isGhostCandidate: boolean
  isSuppressed: boolean
  suppressionReason: GhostSuppressionReason | null
}
