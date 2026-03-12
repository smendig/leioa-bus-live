import type { Arrival, Station } from '../types/transit'
import type { BusConfidenceLabel, BusPrediction, BusRenderState } from '../types/tracking'

export function buildArrivalsPopup(
  station: Station,
  arrivals: Arrival[],
  resolveLineName: (lineRef: string) => string,
): string {
  if (arrivals.length === 0) {
    return `<h3>${station.name}</h3><p>No active buses expected</p>`
  }

  const items = arrivals
    .map((arrival) => `<li><b>${arrival.minutes} min</b> - ${resolveLineName(arrival.lineRef)}</li>`)
    .join('')

  return `<h3>${station.name}</h3><ul class="arrivals-list">${items}</ul>`
}

export function buildBusPopup(
  busId: string,
  prediction: BusPrediction,
  lineName: string,
  renderState: BusRenderState,
  confidenceLabel: BusConfidenceLabel,
): string {
  const stateLabel =
    renderState === 'moving'
      ? 'Moving estimate'
      : renderState === 'holding'
        ? 'Holding at stop'
        : 'Ambiguous estimate'

  return `
    <b>Bus #${busId}</b><br/>
    ${lineName}<br/>
    State: <b>${stateLabel}</b><br/>
    Confidence: <b>${confidenceLabel}</b><br/>
    Next stop: <b>${prediction.station.name}</b> in ${prediction.minutes} mins
  `
}

export function formatTimestamp(value: Date): string {
  return value.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
