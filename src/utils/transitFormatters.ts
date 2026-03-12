import type { BusConfidenceLabel, BusPrediction, BusRenderState } from '../types/tracking'
import type { Arrival, Station } from '../types/transit'

export function buildArrivalsPopup(
  station: Station,
  arrivals: Arrival[],
  resolveLineName: (lineRef: string) => string,
): string {
  if (arrivals.length === 0) {
    return `<h3>${station.name}</h3><p>No hay autobuses activos previstos</p>`
  }

  const items = arrivals
    .map(
      (arrival) => `<li><b>${arrival.minutes} min</b> - ${resolveLineName(arrival.lineRef)}</li>`,
    )
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
      ? 'Estimación en movimiento'
      : renderState === 'holding'
        ? 'Detenido en parada'
        : 'Estimación ambigua'

  return `
    <b>Autobús #${busId}</b><br/>
    ${lineName}<br/>
    Estado: <b>${stateLabel}</b><br/>
    Confianza: <b>${confidenceLabel}</b><br/>
    Próxima parada: <b>${prediction.station.name}</b> en ${prediction.minutes} min
  `
}

export function formatTimestamp(value: Date): string {
  return value.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
