import { SEGMENT_DURATION_PRIORS } from '../config/segmentPriors'
import {
  LOW_ETA_PLATEAU_MAX_MINUTES,
  LOW_ETA_PLATEAU_WARNING_POLLS,
  LOW_ETA_SAME_STOP_OVERLAP_PENALTY,
  MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT,
  PREDICTION_STALE_WARNING_SECONDS,
  SAME_STOP_OVERLAP_PENALTY,
  STALE_PREDICTION_SUPPRESSION_POLLS,
} from '../config/transit'
import type {
  ActiveBusGroup,
  BusConfidenceLabel,
  BusPrediction,
  BusRenderState,
  BusTrackingDiagnostic,
  InterpolationState,
  PredictionHistoryState,
  PredictionSuppressionReason,
  ResolvedBusSegment,
  StationArrivals,
} from '../types/tracking'
import type { Line } from '../types/transit'

export interface BusConfidenceComponents {
  routeContinuityScore: number
  etaStabilityScore: number
  plateauScore: number
  contextScore: number
  freshnessScore: number
}

export interface BusSnapshotContext {
  sameStopOverlapCount: number
  lowEtaSameStopOverlapCount: number
}

export interface BusConfidenceAssessment {
  score: number
  label: BusConfidenceLabel
  routeGapCount: number
  components: BusConfidenceComponents
  context: BusSnapshotContext
  isStaleCandidate: boolean
}

export const EMPTY_SNAPSHOT_CONTEXT: BusSnapshotContext = Object.freeze({
  sameStopOverlapCount: 0,
  lowEtaSameStopOverlapCount: 0,
})

export function collectActiveBuses(results: StationArrivals[]): ActiveBusGroup[] {
  const buses = new Map<string, ActiveBusGroup>()

  results.forEach((result) => {
    result.arrivals.forEach((arrival) => {
      if (arrival.busId === '0' || !Number.isFinite(arrival.minutes)) {
        return
      }
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

export function buildSnapshotContext(
  activeBusGroups: ActiveBusGroup[],
): Map<string, BusSnapshotContext> {
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
        sameStopOverlapCount: 0,
        lowEtaSameStopOverlapCount: 0,
      })
      return
    }

    const stopKey = `${group.lineRef}:${nearest.station.id}`
    const sameStopOverlapCount = Math.max(0, (sameStopCounts.get(stopKey) ?? 0) - 1)
    const lowEtaSameStopOverlapCount =
      nearest.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
        ? Math.max(0, (sameStopLowEtaCounts.get(stopKey) ?? 0) - 1)
        : 0

    contextByTrackingKey.set(group.trackingKey, {
      sameStopOverlapCount,
      lowEtaSameStopOverlapCount,
    })
  })

  return contextByTrackingKey
}

export interface SegmentProgressResolution {
  progressRatio: number
  segmentElapsedSeconds: number
  predictionAgeSeconds: number
}

const CALIBRATED_REMAINING_MINUTES: Record<number, number> = {
  0: 0.51,
  1: 0.81,
  2: 1.88,
  3: 1.88,
  4: 2.9,
  5: 3.98,
  6: 2.32,
  7: 3.13,
  8: 4.13,
}

export function resolveSegmentProgress(
  state: Map<string, InterpolationState>,
  trackingKey: string,
  prediction: BusPrediction,
  segment: ResolvedBusSegment,
  now: number,
): SegmentProgressResolution {
  const currentState = state.get(trackingKey)
  const estimatedSeconds = segment.estimatedSegmentMinutes * 60

  if (!currentState || currentState.targetStationId !== prediction.station.id) {
    const isFirstObservation = !currentState
    const calibratedRemaining = CALIBRATED_REMAINING_MINUTES[prediction.minutes]
    const initialProgress =
      isFirstObservation && calibratedRemaining !== undefined
        ? clampScore(1 - (calibratedRemaining * 60) / estimatedSeconds)
        : 0
    const progressRatio = Math.min(0.9, initialProgress)
    state.set(trackingKey, {
      targetStationId: prediction.station.id,
      segmentEnteredAt: now,
      lastPredictionChangedAt: now,
      lastReportedMinutes: prediction.minutes,
      progressRatio,
    })
    return { progressRatio, segmentElapsedSeconds: 0, predictionAgeSeconds: 0 }
  }

  if (currentState.lastReportedMinutes !== prediction.minutes) {
    currentState.lastReportedMinutes = prediction.minutes
    currentState.lastPredictionChangedAt = now
  }

  const segmentElapsedSeconds = Math.max(0, (now - currentState.segmentEnteredAt) / 1000)
  const predictionAgeSeconds = Math.max(0, (now - currentState.lastPredictionChangedAt) / 1000)
  const elapsedProgress = segmentElapsedSeconds / estimatedSeconds
  const calibratedRemaining = CALIBRATED_REMAINING_MINUTES[prediction.minutes]
  const etaProgress =
    calibratedRemaining === undefined ? 0 : 1 - (calibratedRemaining * 60) / estimatedSeconds
  currentState.progressRatio = Math.min(
    0.98,
    Math.max(currentState.progressRatio, elapsedProgress, etaProgress),
  )

  return { progressRatio: currentState.progressRatio, segmentElapsedSeconds, predictionAgeSeconds }
}

export function resolveBusSegment(
  line: Line,
  predictions: BusPrediction[],
): ResolvedBusSegment | null {
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
  const durationEstimate = estimateSegmentDuration(line, predictions, nextStopIndex)

  return {
    previousStop,
    nextStop,
    ...durationEstimate,
  }
}

export function assessPredictionConfidence(
  line: Line,
  predictions: BusPrediction[],
  history: PredictionHistoryState,
  snapshotContext: BusSnapshotContext,
  predictionAgeSeconds: number,
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

  const contextScore = clampScore(1 - overlapPenalty)
  const freshnessScore = clampScore(
    1 - Math.max(0, predictionAgeSeconds - PREDICTION_STALE_WARNING_SECONDS) / 900,
  )

  const normalizedScore = Number(
    clampScore(
      routeContinuityScore * 0.24 +
        etaStabilityScore * 0.19 +
        plateauScore * 0.24 +
        contextScore * 0.18 +
        freshnessScore * 0.15,
    ).toFixed(2),
  )

  const hasLowEtaOverlap = snapshotContext.lowEtaSameStopOverlapCount > 0
  const isHardFreezeCandidate =
    history.repeatedPolls >= STALE_PREDICTION_SUPPRESSION_POLLS &&
    history.sameStopPolls >= STALE_PREDICTION_SUPPRESSION_POLLS &&
    history.lastMinutes <= LOW_ETA_PLATEAU_MAX_MINUTES &&
    hasLowEtaOverlap
  const isSoftPlateauCandidate =
    history.lowEtaPlateauPolls >= STALE_PREDICTION_SUPPRESSION_POLLS + 4 &&
    plateauScore <= 0.12 &&
    normalizedScore <= 0.22 &&
    hasLowEtaOverlap
  const isStaleCandidate = isHardFreezeCandidate || isSoftPlateauCandidate

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
      freshnessScore: Number(freshnessScore.toFixed(2)),
    },
    context: snapshotContext,
    isStaleCandidate,
  }
}

export function resolveBusRenderState(
  prediction: BusPrediction,
  resolvedSegment: ResolvedBusSegment | null,
  confidence: BusConfidenceAssessment,
  history: PredictionHistoryState,
  successfulPollCount: number,
): BusRenderState {
  if (!resolvedSegment) {
    return 'holding'
  }

  const lowEta = prediction.minutes <= LOW_ETA_PLATEAU_MAX_MINUTES
  const hasLowEtaOverlap = confidence.context.lowEtaSameStopOverlapCount > 0
  const hasSameStopOverlap = confidence.context.sameStopOverlapCount > 0
  const bootstrapConfirmed = successfulPollCount >= MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT
  const hasEarlyStationChange = history.pollsObserved <= 3 && history.stationChanges > 0
  const continuityLooksGood =
    confidence.score >= 0.68 &&
    confidence.components.routeContinuityScore >= 0.7 &&
    confidence.components.contextScore >= 0.62 &&
    confidence.routeGapCount <= 2 &&
    !hasLowEtaOverlap
  const settledSameStopSignal =
    history.pollsObserved >= 3 &&
    history.stationChanges === 0 &&
    prediction.minutes > LOW_ETA_PLATEAU_MAX_MINUTES &&
    continuityLooksGood

  if (hasEarlyStationChange) {
    return 'moving'
  }

  if (!bootstrapConfirmed) {
    if (settledSameStopSignal || (!lowEta && continuityLooksGood)) {
      return 'moving'
    }

    if (lowEta && continuityLooksGood && !hasLowEtaOverlap) {
      return 'ambiguous'
    }

    return lowEta ? 'holding' : 'ambiguous'
  }

  if (confidence.label === 'low') {
    return lowEta ? 'holding' : 'ambiguous'
  }

  if (lowEta) {
    const lowEtaLooksPlausible =
      confidence.score >= 0.62 &&
      confidence.components.contextScore >= 0.6 &&
      confidence.routeGapCount <= 2 &&
      !hasLowEtaOverlap

    if (lowEtaLooksPlausible && (history.stationChanges > 0 || history.pollsObserved >= 4)) {
      return 'moving'
    }

    if (hasLowEtaOverlap) {
      return 'holding'
    }

    return 'ambiguous'
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
  const pollsObserved = previousState ? previousState.pollsObserved + 1 : 1
  const stationChanges =
    previousState && !sameStation
      ? previousState.stationChanges + 1
      : (previousState?.stationChanges ?? 0)
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
    previousState && sameStation && Math.abs(etaDelta) >= 3
      ? previousState.largeEtaJumpCount + 1
      : 0

  if (
    previousState &&
    previousState.lastMinutes === prediction.minutes &&
    previousState.lastStationId === prediction.station.id
  ) {
    const nextState = {
      pollsObserved,
      stationChanges,
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
    pollsObserved,
    stationChanges,
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
  confidence: BusConfidenceAssessment,
): PredictionSuppressionReason | null {
  return confidence.isStaleCandidate ? 'stale_prediction' : null
}

interface BuildBusTrackingDiagnosticArgs {
  trackingKey: string
  busId: string
  lineName: string
  prediction: BusPrediction
  resolvedSegment: ResolvedBusSegment | null
  exactMinutesAway: number
  segmentProgress: number
  segmentElapsedSeconds: number
  predictionAgeSeconds: number
  historyState: PredictionHistoryState
  confidence: BusConfidenceAssessment
  renderState: BusRenderState
  isSuppressed: boolean
  suppressionReason: PredictionSuppressionReason | null
}

export function buildBusTrackingDiagnostic({
  trackingKey,
  busId,
  lineName,
  prediction,
  resolvedSegment,
  exactMinutesAway,
  segmentProgress,
  segmentElapsedSeconds,
  predictionAgeSeconds,
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
    pollsObserved: historyState.pollsObserved,
    stationChanges: historyState.stationChanges,
    minutesToNextStop: Number(exactMinutesAway.toFixed(2)),
    estimatedSegmentMinutes: Number((resolvedSegment?.estimatedSegmentMinutes ?? 0).toFixed(2)),
    progressRatio: Number(segmentProgress.toFixed(2)),
    segmentElapsedSeconds: Number(segmentElapsedSeconds.toFixed(1)),
    predictionAgeSeconds: Number(predictionAgeSeconds.toFixed(1)),
    p10SegmentMinutes: Number((resolvedSegment?.p10SegmentMinutes ?? 0).toFixed(2)),
    p90SegmentMinutes: Number((resolvedSegment?.p90SegmentMinutes ?? 0).toFixed(2)),
    priorSampleSize: resolvedSegment?.priorSampleSize ?? 0,
    priorSource: resolvedSegment?.priorSource ?? 'fallback',
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
    freshnessScore: confidence.components.freshnessScore,
    sameStopOverlapCount: confidence.context.sameStopOverlapCount,
    lowEtaSameStopOverlapCount: confidence.context.lowEtaSameStopOverlapCount,
    isStaleCandidate: confidence.isStaleCandidate,
    isSuppressed,
    suppressionReason,
  }
}

type SegmentDurationEstimate = Pick<
  ResolvedBusSegment,
  | 'estimatedSegmentMinutes'
  | 'p10SegmentMinutes'
  | 'p90SegmentMinutes'
  | 'priorSampleSize'
  | 'priorSource'
>

function estimateSegmentDuration(
  line: Line,
  predictions: BusPrediction[],
  nextStopIndex: number,
): SegmentDurationEstimate {
  const previousStopIndex = getWrappedIndex(nextStopIndex - 1, line.stops.length)
  const previousStopId = line.stops[previousStopIndex]?.id
  const nextStopId = line.stops[nextStopIndex]?.id
  const empiricalPrior =
    previousStopId && nextStopId
      ? SEGMENT_DURATION_PRIORS[`${line.ref}:${previousStopId}->${nextStopId}`]
      : null

  if (empiricalPrior) {
    return {
      estimatedSegmentMinutes: empiricalPrior.medianSeconds / 60,
      p10SegmentMinutes: empiricalPrior.p10Seconds / 60,
      p90SegmentMinutes: empiricalPrior.p90Seconds / 60,
      priorSampleSize: empiricalPrior.sampleSize,
      priorSource: 'line-segment',
    }
  }

  const nextAdjacentStopIndex = getWrappedIndex(nextStopIndex + 1, line.stops.length)
  const nextAdjacentStopId = line.stops[nextAdjacentStopIndex]?.id

  const adjacentPrediction = predictions.find(
    (prediction) => prediction.station.id === nextAdjacentStopId,
  )
  if (adjacentPrediction) {
    const minutes = Math.max(1, adjacentPrediction.minutes - predictions[0].minutes)
    return buildEstimatedDuration(minutes, 'live-adjacent')
  }

  const orderedPredictions = predictions
    .map((prediction) => ({
      prediction,
      stopIndex: line.stops.findIndex((stop) => stop.id === prediction.station.id),
    }))
    .filter((entry) => entry.stopIndex >= 0)
    .sort((left, right) => left.prediction.minutes - right.prediction.minutes)

  const adjacentDeltas: number[] = []
  const localAdjacentDeltas: { delta: number; distanceToTarget: number }[] = []

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
    return buildEstimatedDuration(2, 'fallback')
  }

  localAdjacentDeltas.sort((left, right) => left.distanceToTarget - right.distanceToTarget)
  const nearestDistance = localAdjacentDeltas[0]?.distanceToTarget ?? Number.POSITIVE_INFINITY
  const nearestLocalDeltas = localAdjacentDeltas
    .filter((entry) => entry.distanceToTarget === nearestDistance)
    .map((entry) => entry.delta)

  if (nearestLocalDeltas.length > 0) {
    const minutes = Math.max(1, average(nearestLocalDeltas))
    return buildEstimatedDuration(minutes, 'live-adjacent')
  }

  const minutes = Math.max(1, average(adjacentDeltas))
  return buildEstimatedDuration(minutes, 'live-adjacent')
}

function buildEstimatedDuration(
  minutes: number,
  source: Extract<ResolvedBusSegment['priorSource'], 'live-adjacent' | 'fallback'>,
): SegmentDurationEstimate {
  return {
    estimatedSegmentMinutes: minutes,
    p10SegmentMinutes: source === 'fallback' ? minutes * 0.5 : minutes * 0.65,
    p90SegmentMinutes: source === 'fallback' ? minutes * 2 : minutes * 1.5,
    priorSampleSize: 0,
    priorSource: source,
  }
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

  return predictions.reduce((nearest, current) =>
    current.minutes < nearest.minutes ? current : nearest,
  )
}
