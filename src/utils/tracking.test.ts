import { describe, expect, it } from 'vitest'

import type { InterpolationState, PredictionHistoryState, StationArrivals } from '../types/tracking'
import type { ResolvedBusSegment } from '../types/tracking'
import type { Line, Station } from '../types/transit'
import {
  assessPredictionConfidence,
  collectActiveBuses,
  EMPTY_SNAPSHOT_CONTEXT,
  filterPredictionOutliers,
  resolveBusSegment,
  resolveMissingBus,
  resolveSegmentProgress,
  resolveSuppressionReason,
  updatePredictionHistory,
} from './tracking'

const station = (id: string): Station => ({
  id,
  name: id,
  lat: 43,
  lng: -3,
  position: [-3, 43],
})

const line: Line = {
  ref: 'L.2 LEIOA',
  name: 'Line 2',
  encodedPath: '',
  stops: ['366', '358', '359'].map((id, sequence) => ({ ...station(id), sequence })),
}

function requireSegment(segment: ResolvedBusSegment | null): ResolvedBusSegment {
  expect(segment).not.toBeNull()
  if (!segment) throw new Error('Expected a resolved segment')
  return segment
}

describe('collectActiveBuses', () => {
  it('does not turn an unassigned IdBus=0 service into a physical marker', () => {
    const results: StationArrivals[] = [
      {
        station: station('358'),
        isSuccessful: true,
        arrivals: [
          {
            busId: '0',
            serviceId: '',
            minutes: 3,
            lineRef: line.ref,
            directionName: '',
            isValid: true,
          },
          {
            busId: '306',
            serviceId: '1967',
            minutes: 4,
            lineRef: line.ref,
            directionName: 'METRO LAMIAKO',
            isValid: true,
          },
        ],
      },
    ]

    expect(collectActiveBuses(results)).toMatchObject([
      { busId: '306', serviceId: '1967', directionName: 'METRO LAMIAKO' },
    ])
  })
})

describe('prediction outlier filtering', () => {
  it('removes an isolated spike while preserving the route rollover', () => {
    const empiricalLine: Line = {
      ...line,
      stops: ['350', '351', '352', '358', '359', '363'].map((id, sequence) => ({
        ...station(id),
        sequence,
      })),
    }
    const predictions = [
      ['350', 29],
      ['351', 150],
      ['352', 31],
      ['358', 40],
      ['359', 1],
      ['363', 3],
    ].map(([id, minutes]) => ({
      station: station(String(id)),
      minutes: Number(minutes),
      lineRef: empiricalLine.ref,
    }))

    expect(
      filterPredictionOutliers(empiricalLine, predictions).map((prediction) => [
        prediction.station.id,
        prediction.minutes,
      ]),
    ).toEqual([
      ['350', 29],
      ['352', 31],
      ['358', 40],
      ['359', 1],
      ['363', 3],
    ])
  })
})

describe('temporary disappearance handling', () => {
  it('keeps a bus for the grace window and removes it after sustained absence', () => {
    expect(resolveMissingBus(0, false, 2)).toEqual({ missingPolls: 1, shouldRemove: false })
    expect(resolveMissingBus(1, false, 2)).toEqual({ missingPolls: 2, shouldRemove: false })
    expect(resolveMissingBus(2, false, 2)).toEqual({ missingPolls: 3, shouldRemove: true })
    expect(resolveMissingBus(2, true, 2)).toEqual({ missingPolls: 0, shouldRemove: false })
  })
})

describe('segment duration model', () => {
  it('uses a line-specific empirical distribution', () => {
    const predictions = [{ station: station('358'), minutes: 1, lineRef: line.ref }]
    const segment = resolveBusSegment(line, predictions)

    expect(segment).toMatchObject({
      priorSource: 'line-segment',
      priorSampleSize: 988,
      estimatedSegmentMinutes: 46.83 / 60,
    })
  })

  it('keeps progress monotonic when the integer ETA changes', () => {
    const predictions = [{ station: station('358'), minutes: 2, lineRef: line.ref }]
    const segment = requireSegment(resolveBusSegment(line, predictions))

    const state = new Map<string, InterpolationState>()
    const first = resolveSegmentProgress(state, '306:L.2', predictions[0], segment, 0)
    const later = resolveSegmentProgress(
      state,
      '306:L.2',
      { ...predictions[0], minutes: 1 },
      segment,
      20_000,
    )
    const afterEtaIncrease = resolveSegmentProgress(
      state,
      '306:L.2',
      { ...predictions[0], minutes: 2 },
      segment,
      40_000,
    )

    expect(later.progressRatio).toBeGreaterThanOrEqual(first.progressRatio)
    expect(afterEtaIncrease.progressRatio).toBeGreaterThanOrEqual(later.progressRatio)
    expect(afterEtaIncrease.segmentElapsedSeconds).toBe(40)
    expect(afterEtaIncrease.predictionAgeSeconds).toBe(0)
  })

  it('starts a new segment at zero after a target-stop transition', () => {
    const state = new Map<string, InterpolationState>()
    const firstPrediction = { station: station('358'), minutes: 0, lineRef: line.ref }
    const firstSegment = requireSegment(resolveBusSegment(line, [firstPrediction]))
    resolveSegmentProgress(state, '306:L.2', firstPrediction, firstSegment, 0)
    const progressed = resolveSegmentProgress(
      state,
      '306:L.2',
      firstPrediction,
      firstSegment,
      40_000,
    )

    const nextPrediction = { station: station('359'), minutes: 2, lineRef: line.ref }
    const nextSegment = requireSegment(resolveBusSegment(line, [nextPrediction]))
    const transitioned = resolveSegmentProgress(
      state,
      '306:L.2',
      nextPrediction,
      nextSegment,
      45_000,
    )

    expect(progressed.progressRatio).toBeGreaterThan(0)
    expect(transitioned.progressRatio).toBe(0)
  })
})

describe('stale prediction handling', () => {
  it('does not suppress the common six-minute low-ETA plateau', () => {
    const prediction = { station: station('358'), minutes: 1, lineRef: line.ref }
    const state = new Map<string, PredictionHistoryState>()
    let history = updatePredictionHistory(state, '306:L.2', prediction)
    for (let poll = 1; poll < 24; poll += 1) {
      history = updatePredictionHistory(state, '306:L.2', prediction)
    }

    const confidence = assessPredictionConfidence(
      line,
      [prediction],
      history,
      EMPTY_SNAPSHOT_CONTEXT,
      6 * 60,
    )

    expect(confidence.isStaleCandidate).toBe(false)
    expect(resolveSuppressionReason(confidence)).toBeNull()
  })

  it('requires prolonged corroborated staleness and recovers on a changed ETA', () => {
    const prediction = { station: station('358'), minutes: 1, lineRef: line.ref }
    const state = new Map<string, PredictionHistoryState>()
    let history = updatePredictionHistory(state, '306:L.2', prediction)
    for (let poll = 1; poll < 120; poll += 1) {
      history = updatePredictionHistory(state, '306:L.2', prediction)
    }
    const riskyContext = {
      ...EMPTY_SNAPSHOT_CONTEXT,
      sameStopOverlapCount: 1,
      lowEtaSameStopOverlapCount: 1,
    }
    const staleConfidence = assessPredictionConfidence(
      line,
      [prediction],
      history,
      riskyContext,
      30 * 60,
    )
    expect(resolveSuppressionReason(staleConfidence)).toBe('stale_prediction')

    const changedPrediction = { ...prediction, minutes: 0 }
    const changedHistory = updatePredictionHistory(state, '306:L.2', changedPrediction)
    const recoveredConfidence = assessPredictionConfidence(
      line,
      [changedPrediction],
      changedHistory,
      riskyContext,
      0,
    )
    expect(resolveSuppressionReason(recoveredConfidence)).toBeNull()
  })
})
