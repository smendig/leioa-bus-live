import type { BusConfidenceLabel, BusPrediction, BusRenderState } from '../types/tracking'
import type { Arrival, Station } from '../types/transit'

export function buildArrivalsPopup(
  station: Station,
  arrivals: Arrival[],
  resolveLineName: (lineRef: string) => string,
): string {
  if (arrivals.length === 0) {
    return `<h3>${escapeHtml(station.name)}</h3><p class="popup-empty">No hay autobuses previstos ahora</p>`
  }

  const items = arrivals
    .sort((left, right) => left.minutes - right.minutes)
    .map((arrival) => {
      const timeLabel = arrival.minutes <= 0 ? 'Llegando' : `${arrival.minutes} min`
      return `<li><strong class="arrival-time">${timeLabel}</strong><span>${escapeHtml(resolveLineName(arrival.lineRef))}</span></li>`
    })
    .join('')

  return `<h3>${escapeHtml(station.name)}</h3><ul class="arrivals-list">${items}</ul>`
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

  const confidenceExplanation =
    confidenceLabel === 'high'
      ? 'señal consistente'
      : confidenceLabel === 'medium'
        ? 'predicción aproximada'
        : 'información inestable o antigua'

  return `
    <div class="bus-popup">
      <div class="bus-popup__header">
        <strong>Autobús #${escapeHtml(busId)}</strong>
        <span class="confidence-badge confidence-badge--${confidenceLabel}">${confidenceLabel}</span>
      </div>
      <p class="bus-popup__line">${escapeHtml(lineName)}</p>
      <dl>
        <div><dt>Estado</dt><dd>${stateLabel}</dd></div>
        <div><dt>Próxima parada</dt><dd>${escapeHtml(prediction.station.name)}</dd></div>
        <div><dt>Llegada</dt><dd>${prediction.minutes <= 0 ? 'Llegando' : `${prediction.minutes} min`}</dd></div>
      </dl>
      <p class="bus-popup__note">${confidenceExplanation}</p>
    </div>
  `
}

export function formatTimestamp(value: Date): string {
  return value.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function escapeHtml(value: unknown): string {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  )
}
