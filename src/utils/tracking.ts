import {
  EMPIRICAL_SEGMENT_PRIORS_MINUTES,
  ELAPSED_TIMEOUT_EXTRA_MINUTES,
  GHOST_BUS_GRACE_MINUTES,
  LOW_ETA_GHOST_POLLS,
  LOW_ETA_PLATEAU_MAX_MINUTES,
  LOW_ETA_PLATEAU_WARNING_POLLS,
  LOW_ETA_SAME_STOP_OVERLAP_PENALTY,
  MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT,
  SAME_STOP_OVERLAP_PENALTY,
  TRACKING_HOTSPOT_PRIORS,
  TRACKING_VOLATILE_STOP_PRIORS,
} from '../config/transit'
import type { Line } from '../types/transit'
import type {
  ActiveBusGroup,
  BusRenderState,
  BusTrackingDiagnostic,
  StationArrivals,
  BusPrediction,
  BusConfidenceLabel,
  GhostBusState,
  GhostSuppressionReason,
  InterpolationState,
  PredictionHistoryState,
  ResolvedBusSegment,
} from '../types/tracking'

export type BusConfidenceComponents = {
  routeContinuityScore: number
  etaStabilityScore: number
  plateauScore: number
  contextScore: number
}

export type BusSnapshotContext = {
  hotspotLabel: string | null
  hotspotPenalty: number
  sameStopOverlapCount: number
  lowEtaSameStopOverlapCount: number
}

export type BusConfidenceAssessment = {
  score: number
  label: BusConfidenceLabel
  routeGapCount: number
  components: BusConfidenceComponents
  context: BusSnapshotContext
  isGhostCandidate: boolean
  ghostReason: GhostSuppressionReason | null
}

export const EMPTY_SNAPSHOT_CONTEXT: BusSnapshotContext = Object.freeze({
  hotspotLabel: null,
  hotspotPenalty: 0,
  sameStopOverlapCount: 0,
  lowEtaSameStopOverlapCount: 0,
})

export function collectActiveBuses(results: StationArrivals[]): ActiveBusGroup[] {
  const buses = new Map<string, ActiveBusGroup>()

  results.forEach((result) => {
    result.arrivals.forEach((arrival) => {
      const trackingKey = `${arrival.busId}:${arrival.lineRef}`
      if (!buses.has(trackingKey)) {
        buses.set(trackingKey, {
          trackingKey,
          busId: arrival.busId,
          lineRef: arrival.lineRef,
          predictions: [],
        })
      }

      buses.get(trackingKey)?.predictions.push({
        station: result.station,
        minutes: arrival.minutes,
        lineRef: arrival.lineRef,
      })
    })
  })

  return [...buses.values()]
}

export function buildSnapshotContext(activeBusGroups: ActiveBusGroup[]): Map<string, BusSnapshotContext> {
  const sameStopCounts = new Map<string, number>()
  const sameStopLowEtaCounts = new Map<string, number>()

  activeBusGroups.forEach((group) => {
    const nearest = getNearestPrediction(group.predictions)
    if (!nearest) {
      return
    }

    const stopKey = `${group.lineRef}:${nearest.station.id}`
    sameStopCounts.set(stopKey, (sameStopCounts.get(stopKey) ?? 0) + 1)

    if (nearest.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES) {
      sameStopLowEtaCounts.set(stopKey, (sameStopLowEtaCounts.get(stopKey) ?? 0) + 1)
    }
  })

  const contextByTrackingKey = new Map<string, BusSnapshotContext>()

  activeBusGroups.forEach((group) => {
    const nearest = getNearestPrediction(group.predictions)
    if (!nearest) {
      contextByTrackingKey.set(group.trackingKey, {
        hotspotLabel: null,
        hotspotPenalty: 0,
        sameStopOverlapCount: 0,
        lowEtaSameStopOverlapCount: 0,
      })
      return
    }

    const stopKey = `${group.lineRef}:${nearest.station.id}`
    const hotspot = TRACKING_HOTSPOT_PRIORS[stopKey]
    const volatileStop = TRACKING_VOLATILE_STOP_PRIORS[nearest.station.id]
    const sameStopOverlapCount = Math.max(0, (sameStopCounts.get(stopKey) ?? 0) - 1)
    const lowEtaSameStopOverlapCount =
      nearest.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
        ? Math.max(0, (sameStopLowEtaCounts.get(stopKey) ?? 0) - 1)
        : 0

    let hotspotPenalty = (hotspot?.basePenalty ?? 0) + (volatileStop?.basePenalty ?? 0)
    if (nearest.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES) {
      hotspotPenalty += (hotspot?.lowEtaPenalty ?? 0) + (volatileStop?.lowEtaPenalty ?? 0)
    }

    if (lowEtaSameStopOverlapCount > 0) {
      hotspotPenalty += (hotspot?.overlapPenalty ?? 0) + (volatileStop?.overlapPenalty ?? 0)
    }

    const labels = [hotspot?.label, volatileStop?.label].filter(Boolean)
    contextByTrackingKey.set(group.trackingKey, {
      hotspotLabel: labels.length > 0 ? labels.join(' + ') : null,
      hotspotPenalty: Number(Math.min(0.6, hotspotPenalty).toFixed(2)),
      sameStopOverlapCount,
      lowEtaSameStopOverlapCount,
    })
  })

  return contextByTrackingKey
}

export function resolveElapsedMinutes(
  state: Map<string, InterpolationState>,
  busId: string,
  nextMinutes: number,
  stationId: string,
  now: number,
): number {
  const currentState = state.get(busId)

  if (
    !currentState ||
    currentState.reportedMinutes !== nextMinutes ||
    currentState.targetStationId !== stationId
  ) {
    state.set(busId, {
      reportedMinutes: nextMinutes,
      targetStationId: stationId,
      localStartTime: now,
    })

    return 0
  }

  return (now - currentState.localStartTime) / 60000
}

export function isGhostPrediction(
  persistedGhost: GhostBusState | null,
  prediction: BusPrediction,
): boolean {
  if (!persistedGhost) {
    return false
  }

  if (persistedGhost.reason === 'low_eta_plateau') {
    return (
      persistedGhost.stationId === prediction.station.id &&
      prediction.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
    )
  }

  return (
    persistedGhost.minutes === prediction.minutes &&
    persistedGhost.stationId === prediction.station.id
  )
}

export function resolveBusSegment(line: Line, predictions: BusPrediction[]): ResolvedBusSegment | null {
  if (line.stops.length < 2 || predictions.length === 0) {
    return null
  }

  const nextPrediction = predictions[0]
  const nextStopIndex = line.stops.findIndex((stop) => stop.id === nextPrediction.station.id)
  if (nextStopIndex < 0) {
    return null
  }

  const previousStopIndex = getWrappedIndex(nextStopIndex - 1, line.stops.length)
  const previousStop = line.stops[previousStopIndex]
  const nextStop = line.stops[nextStopIndex]

  return {
    previousStop,
    nextStop,
    estimatedSegmentMinutes: estimateSegmentMinutes(line, predictions, nextStopIndex),
  }
}

export function calculateSegmentProgress(
  minutesToNextStop: number,
  estimatedSegmentMinutes: number,
): number {
  if (estimatedSegmentMinutes <= 0) {
    return 0
  }

  const rawProgress = 1 - minutesToNextStop / estimatedSegmentMinutes
  return Math.min(1, Math.max(0, rawProgress))
}

export function assessPredictionConfidence(
  line: Line,
  predictions: BusPrediction[],
  history: PredictionHistoryState,
  snapshotContext: BusSnapshotContext,
): BusConfidenceAssessment {
  const routeGapCount = countRouteGaps(line, predictions)
  const routeContinuityScore = clampScore(1 - Math.min(0.55, routeGapCount * 0.08))
  const etaStabilityScore = clampScore(
    1 -
      Math.min(0.25, history.sameStopEtaIncreaseCount * 0.15) -
      Math.min(0.35, history.largeEtaJumpCount * 0.12),
  )

  const lowEtaPlateauPenalty =
    history.lowEtaPlateauPolls <= LOW_ETA_PLATEAU_WARNING_POLLS
      ? 0
      : Math.min(0.7, (history.lowEtaPlateauPolls - LOW_ETA_PLATEAU_WARNING_POLLS) * 0.015)

  const plateauScore = clampScore(
    1 -
      Math.min(0.18, Math.max(0, history.repeatedPolls - 1) * 0.015) -
      Math.min(0.2, Math.max(0, history.sameStopPolls - 6) * 0.008) -
      lowEtaPlateauPenalty,
  )

  const overlapPenalty =
    Math.min(0.12, snapshotContext.sameStopOverlapCount * SAME_STOP_OVERLAP_PENALTY) +
    Math.min(0.32, snapshotContext.lowEtaSameStopOverlapCount * LOW_ETA_SAME_STOP_OVERLAP_PENALTY)

  const contextScore = clampScore(1 - snapshotContext.hotspotPenalty - overlapPenalty)

  const normalizedScore = Number(
    clampScore(
      routeContinuityScore * 0.25 +
      etaStabilityScore * 0.2 +
      plateauScore * 0.35 +
      contextScore * 0.2,
    ).toFixed(2),
  )

  const isHardFreezeCandidate =
    history.repeatedPolls >= LOW_ETA_GHOST_POLLS && history.lastMinutes <= LOW_ETA_PLATEAU_MAX_MINUTES
  const isSoftPlateauCandidate =
    history.lowEtaPlateauPolls >= LOW_ETA_GHOST_POLLS && plateauScore <= 0.15 && normalizedScore <= 0.25
  const isGhostCandidate = isHardFreezeCandidate || isSoftPlateauCandidate

  const ghostReason = isGhostCandidate ? 'low_eta_plateau' : null
  const label: BusConfidenceLabel =
    normalizedScore >= 0.75 ? 'high' : normalizedScore >= 0.45 ? 'medium' : 'low'

  return {
    score: normalizedScore,
    label,
    routeGapCount,
    components: {
      routeContinuityScore: Number(routeContinuityScore.toFixed(2)),
      etaStabilityScore: Number(etaStabilityScore.toFixed(2)),
      plateauScore: Number(plateauScore.toFixed(2)),
      contextScore: Number(contextScore.toFixed(2)),
    },
    context: snapshotContext,
    isGhostCandidate,
    ghostReason,
  }
}

export function resolveBusRenderState(
  prediction: BusPrediction,
  resolvedSegment: ResolvedBusSegment | null,
  confidence: BusConfidenceAssessment,
  successfulPollCount: number,
): BusRenderState {
  if (!resolvedSegment) {
    return 'holding'
  }

  const lowEta = prediction.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
  const hasHotspotRisk = confidence.context.hotspotPenalty >= 0.18
  const hasLowEtaOverlap = confidence.context.lowEtaSameStopOverlapCount > 0
  const hasSameStopOverlap = confidence.context.sameStopOverlapCount > 0
  const bootstrapConfirmed = successfulPollCount >= MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT
  const strongColdStartCandidate =
    confidence.score >= 0.72 &&
    confidence.components.routeContinuityScore >= 0.75 &&
    confidence.components.contextScore >= 0.75 &&
    confidence.routeGapCount <= 2 &&
    !hasLowEtaOverlap &&
    !lowEta

  if (lowEta && (hasHotspotRisk || hasLowEtaOverlap || confidence.label === 'low')) {
    return 'holding'
  }

  if (!bootstrapConfirmed) {
    if (strongColdStartCandidate) {
      return 'moving'
    }

    return lowEta ? 'holding' : 'ambiguous'
  }

  if (confidence.label === 'low') {
    return lowEta ? 'holding' : 'ambiguous'
  }

  if (hasHotspotRisk && lowEta) {
    return 'holding'
  }

  if (hasLowEtaOverlap || hasSameStopOverlap || confidence.routeGapCount >= 3) {
    return 'ambiguous'
  }

  return 'moving'
}

export function updatePredictionHistory(
  state: Map<string, PredictionHistoryState>,
  trackingKey: string,
  prediction: BusPrediction,
): PredictionHistoryState {
  const previousState = state.get(trackingKey)
  const sameStation = previousState?.lastStationId === prediction.station.id
  const etaDelta = previousState ? prediction.minutes - previousState.lastMinutes : 0
  const sameStopPolls = previousState && sameStation ? previousState.sameStopPolls + 1 : 1
  const lowEtaPlateauPolls =
    previousState && sameStation && prediction.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
      ? previousState.lowEtaPlateauPolls + 1
      : prediction.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
        ? 1
        : 0
  const sameStopEtaIncreaseCount =
    previousState && sameStation && etaDelta > 0 ? previousState.sameStopEtaIncreaseCount + 1 : 0
  const largeEtaJumpCount =
    previousState && sameStation && Math.abs(etaDelta) >= 3 ? previousState.largeEtaJumpCount + 1 : 0

  if (
    previousState &&
    previousState.lastMinutes === prediction.minutes &&
    previousState.lastStationId === prediction.station.id
  ) {
    const nextState = {
      repeatedPolls: previousState.repeatedPolls + 1,
      lastMinutes: prediction.minutes,
      lastStationId: prediction.station.id,
      sameStopPolls,
      lowEtaPlateauPolls,
      sameStopEtaIncreaseCount: previousState.sameStopEtaIncreaseCount,
      largeEtaJumpCount: previousState.largeEtaJumpCount,
    }
    state.set(trackingKey, nextState)
    return nextState
  }

  const nextState = {
    repeatedPolls: 1,
    lastMinutes: prediction.minutes,
    lastStationId: prediction.station.id,
    sameStopPolls,
    lowEtaPlateauPolls,
    sameStopEtaIncreaseCount,
    largeEtaJumpCount,
  }
  state.set(trackingKey, nextState)
  return nextState
}

export function resolveSuppressionReason(
  prediction: BusPrediction,
  elapsedMinutes: number,
  confidence: BusConfidenceAssessment,
): GhostSuppressionReason | null {
  if (elapsedMinutes > prediction.minutes + GHOST_BUS_GRACE_MINUTES + ELAPSED_TIMEOUT_EXTRA_MINUTES) {
    return 'elapsed_timeout'
  }

  if (confidence.isGhostCandidate) {
    return confidence.ghostReason
  }

  return null
}

type BuildBusTrackingDiagnosticArgs = {
  trackingKey: string
  busId: string
  lineName: string
  prediction: BusPrediction
  resolvedSegment: ResolvedBusSegment | null
  exactMinutesAway: number
  segmentProgress: number
  historyState: PredictionHistoryState
  confidence: BusConfidenceAssessment
  renderState: BusRenderState
  isSuppressed: boolean
  suppressionReason: GhostSuppressionReason | null
}

export function buildBusTrackingDiagnostic({
  trackingKey,
  busId,
  lineName,
  prediction,
  resolvedSegment,
  exactMinutesAway,
  segmentProgress,
  historyState,
  confidence,
  renderState,
  isSuppressed,
  suppressionReason,
}: BuildBusTrackingDiagnosticArgs): BusTrackingDiagnostic {
  return {
    trackingKey,
    busId,
    lineName,
    previousStopName: resolvedSegment?.previousStop.name ?? 'Unknown',
    nextStopName: resolvedSegment?.nextStop.name ?? prediction.station.name,
    renderState,
    minutesToNextStop: Number(exactMinutesAway.toFixed(2)),
    estimatedSegmentMinutes: Number((resolvedSegment?.estimatedSegmentMinutes ?? 0).toFixed(2)),
    progressRatio: Number(segmentProgress.toFixed(2)),
    repeatedPolls: historyState.repeatedPolls,
    sameStopPolls: historyState.sameStopPolls,
    lowEtaPlateauPolls: historyState.lowEtaPlateauPolls,
    sameStopEtaIncreaseCount: historyState.sameStopEtaIncreaseCount,
    largeEtaJumpCount: historyState.largeEtaJumpCount,
    routeGapCount: confidence.routeGapCount,
    confidenceScore: confidence.score,
    confidenceLabel: confidence.label,
    routeContinuityScore: confidence.components.routeContinuityScore,
    etaStabilityScore: confidence.components.etaStabilityScore,
    plateauScore: confidence.components.plateauScore,
    contextScore: confidence.components.contextScore,
    hotspotLabel: confidence.context.hotspotLabel,
    hotspotPenalty: confidence.context.hotspotPenalty,
    sameStopOverlapCount: confidence.context.sameStopOverlapCount,
    lowEtaSameStopOverlapCount: confidence.context.lowEtaSameStopOverlapCount,
    isGhostCandidate: confidence.isGhostCandidate,
    isSuppressed,
    suppressionReason,
  }
}

function estimateSegmentMinutes(
  line: Line,
  predictions: BusPrediction[],
  nextStopIndex: number,
): number {
  const previousStopIndex = getWrappedIndex(nextStopIndex - 1, line.stops.length)
  const previousStopId = line.stops[previousStopIndex]?.id
  const nextStopId = line.stops[nextStopIndex]?.id
  const empiricalPriorMinutes =
    previousStopId && nextStopId
      ? EMPIRICAL_SEGMENT_PRIORS_MINUTES[`${previousStopId}->${nextStopId}`]
      : null

  if (empiricalPriorMinutes && empiricalPriorMinutes > 0) {
    return empiricalPriorMinutes
  }

  const nextAdjacentStopIndex = getWrappedIndex(nextStopIndex + 1, line.stops.length)
  const nextAdjacentStopId = line.stops[nextAdjacentStopIndex]?.id

  const adjacentPrediction = predictions.find((prediction) => prediction.station.id === nextAdjacentStopId)
  if (adjacentPrediction) {
    return Math.max(1, adjacentPrediction.minutes - predictions[0].minutes)
  }

  const orderedPredictions = predictions
    .map((prediction) => ({
      prediction,
      stopIndex: line.stops.findIndex((stop) => stop.id === prediction.station.id),
    }))
    .filter((entry) => entry.stopIndex >= 0)
    .sort((left, right) => left.prediction.minutes - right.prediction.minutes)

  const adjacentDeltas: number[] = []
  const localAdjacentDeltas: Array<{ delta: number; distanceToTarget: number }> = []

  for (let index = 0; index < orderedPredictions.length - 1; index += 1) {
    const current = orderedPredictions[index]
    const next = orderedPredictions[index + 1]
    const expectedNextIndex = getWrappedIndex(current.stopIndex + 1, line.stops.length)

    if (next.stopIndex === expectedNextIndex) {
      const delta = next.prediction.minutes - current.prediction.minutes
      adjacentDeltas.push(delta)
      localAdjacentDeltas.push({
        delta,
        distanceToTarget: circularDistance(current.stopIndex, nextStopIndex, line.stops.length),
      })
    }
  }

  if (adjacentDeltas.length === 0) {
    return 2
  }

  localAdjacentDeltas.sort((left, right) => left.distanceToTarget - right.distanceToTarget)
  const nearestDistance = localAdjacentDeltas[0]?.distanceToTarget ?? Number.POSITIVE_INFINITY
  const nearestLocalDeltas = localAdjacentDeltas
    .filter((entry) => entry.distanceToTarget === nearestDistance)
    .map((entry) => entry.delta)

  if (nearestLocalDeltas.length > 0) {
    return Math.max(1, average(nearestLocalDeltas))
  }

  const averageDelta =
    average(adjacentDeltas)

  return Math.max(1, averageDelta)
}

function countRouteGaps(line: Line, predictions: BusPrediction[]): number {
  const orderedPredictions = predictions
    .map((prediction) => ({
      prediction,
      stopIndex: line.stops.findIndex((stop) => stop.id === prediction.station.id),
    }))
    .filter((entry) => entry.stopIndex >= 0)
    .sort((left, right) => left.prediction.minutes - right.prediction.minutes)

  let routeGapCount = 0

  for (let index = 0; index < orderedPredictions.length - 1; index += 1) {
    const current = orderedPredictions[index]
    const next = orderedPredictions[index + 1]
    const expectedNextIndex = getWrappedIndex(current.stopIndex + 1, line.stops.length)

    if (next.stopIndex !== expectedNextIndex) {
      routeGapCount += 1
    }
  }

  return routeGapCount
}

function getWrappedIndex(index: number, total: number): number {
  return ((index % total) + total) % total
}

function circularDistance(fromIndex: number, toIndex: number, total: number): number {
  const forward = Math.abs(toIndex - fromIndex)
  return Math.min(forward, total - forward)
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function getNearestPrediction(predictions: BusPrediction[]): BusPrediction | null {
  if (predictions.length === 0) {
    return null
  }

  return predictions.reduce((nearest, current) => (current.minutes < nearest.minutes ? current : nearest))
}
