import { PREDICTION_STALE_WARNING_SECONDS } from '../config/transit'
import type { BusConfidenceLabel, BusPrediction, BusRenderState } from '../types/tracking'
import type { Arrival, Station } from '../types/transit'

const CONFIDENCE_PRESENTATION = {
  high: {
    level: 'Alta',
    explanation: 'señal consistente',
    signal: 'Actualizado',
  },
  medium: {
    level: 'Media',
    explanation: 'predicción aproximada',
    signal: 'Aproximado',
  },
  low: {
    level: 'Baja',
    explanation: 'información inestable o antigua',
    signal: 'Información antigua',
  },
} as const satisfies Record<
  BusConfidenceLabel,
  { level: string; explanation: string; signal: string }
>

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
      const timeLabel = formatEta(arrival.minutes)
      const destination = arrival.directionName || resolveLineName(arrival.lineRef)
      return `<li><strong class="arrival-time">${timeLabel}</strong><span>${escapeHtml(destination)}</span></li>`
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
  predictionAgeSeconds = 0,
  directionName = '',
): string {
  const stateLabel =
    renderState === 'moving'
      ? 'Estimación en movimiento'
      : renderState === 'holding'
        ? 'Detenido en parada'
        : 'Estimación ambigua'

  const confidenceExplanation = CONFIDENCE_PRESENTATION[confidenceLabel].explanation
  const freshnessLabel = formatPredictionFreshness(predictionAgeSeconds)
  const confidenceText = formatConfidenceLevel(confidenceLabel)

  return `
    <div class="bus-popup">
      <div class="bus-popup__header">
        <strong>Autobús #${escapeHtml(busId)}</strong>
        <span class="confidence-badge confidence-badge--${confidenceLabel}">${confidenceText}</span>
      </div>
      <p class="bus-popup__line">${escapeHtml(lineName)}</p>
      ${directionName ? `<p class="bus-popup__direction">Hacia ${escapeHtml(directionName)}</p>` : ''}
      <dl>
        <div><dt>Estado</dt><dd>${stateLabel}</dd></div>
        <div><dt>Próxima parada</dt><dd>${escapeHtml(prediction.station.name)}</dd></div>
        <div><dt>Llegada</dt><dd>${formatEta(prediction.minutes)}</dd></div>
      </dl>
      <p class="bus-popup__note">${confidenceExplanation}. ${freshnessLabel}.</p>
    </div>
  `
}

export function formatEta(minutes: number): string {
  return minutes <= 0 ? 'Llegando' : `${minutes} min`
}

export function formatConfidenceLevel(confidence: BusConfidenceLabel): string {
  return CONFIDENCE_PRESENTATION[confidence].level
}

export function formatBusSignal(
  confidence: BusConfidenceLabel,
  predictionAgeSeconds: number,
): string {
  if (confidence === 'low' || predictionAgeSeconds >= PREDICTION_STALE_WARNING_SECONDS) {
    return 'Información antigua'
  }
  return CONFIDENCE_PRESENTATION[confidence].signal
}

function formatPredictionFreshness(predictionAgeSeconds: number): string {
  if (predictionAgeSeconds < 60) return 'Predicción actualizada recientemente'
  return `Predicción sin cambios desde hace ${Math.max(1, Math.round(predictionAgeSeconds / 60))} min`
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
