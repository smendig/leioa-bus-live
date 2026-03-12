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
export type GhostSuppressionReason = 'elapsed_timeout' | 'low_eta_plateau'

export interface GhostBusState {
  minutes: number
  stationId: string
  reason: GhostSuppressionReason
}

export interface InterpolationState {
  reportedMinutes: number
  targetStationId: string
  localStartTime: number
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
}

export interface ResolvedBusSegment {
  previousStop: LineStop
  nextStop: LineStop
  estimatedSegmentMinutes: number
}

export interface BusTrackingDiagnostic {
  trackingKey: string
  busId: string
  lineName: string
  previousStopName: string
  nextStopName: string
  renderState: BusRenderState
  pollsObserved: number
  stationChanges: number
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
