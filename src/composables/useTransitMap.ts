import L from 'leaflet'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import busLocationIconUrl from '../assets/bus-location.png'
import {
  LINE_COLORS,
  MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT,
  MAP_BOOTSTRAP_POLL_DELAYS_MS,
  MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT,
  MAP_DEFAULT_CENTER,
  MAP_POLL_INTERVAL_MS,
  NO_SERVICE_LOCAL_HOURS,
  NO_SERVICE_LOCAL_TIMEZONE,
  NO_SERVICE_ZERO_ACTIVE_POLLS_DAY,
  NO_SERVICE_ZERO_ACTIVE_POLLS_NIGHT,
} from '../config/transit'
import { MOBILE_MEDIA_QUERY } from '../config/ui'
import { getArrivals, getTopology } from '../services/api'
import { decodeLineGeometry, getDisplayGeometry, resolveMarkerPosition } from '../services/geo'
import type {
  ActiveBusGroup,
  BusPrediction,
  BusTrackingDiagnostic,
  GhostBusState,
  GhostSuppressionReason,
  InterpolationState,
  LineWithGeometry,
  PredictionHistoryState,
  StationArrivals,
} from '../types/tracking'
import type { Line, Station } from '../types/transit'
import {
  assessPredictionConfidence,
  buildBusTrackingDiagnostic,
  buildSnapshotContext,
  calculateSegmentProgress,
  collectActiveBuses,
  EMPTY_SNAPSHOT_CONTEXT,
  isGhostPrediction,
  resolveBusRenderState,
  resolveBusSegment,
  resolveElapsedMinutes,
  resolveSuppressionReason,
  updatePredictionHistory,
} from '../utils/tracking'
import { buildArrivalsPopup, buildBusPopup, formatTimestamp } from '../utils/transitFormatters'

const MAP_ELEMENT_ID = 'map'
const BUS_MARKER_ICON_SIZE = [72, 48] as const
const BUS_MARKER_ICON = L.icon({
  iconUrl: busLocationIconUrl,
  iconSize: [...BUS_MARKER_ICON_SIZE],
  iconAnchor: [BUS_MARKER_ICON_SIZE[0] / 2, BUS_MARKER_ICON_SIZE[1]],
  popupAnchor: [0, -BUS_MARKER_ICON_SIZE[1] + 6],
})

export function useTransitMap() {
  const map = shallowRef<L.Map | null>(null)
  const isLoading = ref(true)
  const errorMessage = ref<string | null>(null)
  const lastUpdatedAt = ref<Date | null>(null)
  const diagnostics = ref<BusTrackingDiagnostic[]>([])
  const bootstrapSampleCount = ref(0)
  const activeBusCount = ref(0)
  const zeroActivePolls = ref(0)
  const hasObservedActiveBus = ref(false)
  const noServiceLikely = ref(false)

  const stationsCache = ref<Station[]>([])
  const linesCache = ref<LineWithGeometry[]>([])
  const activeBusLayers = new Map<string, L.Marker>()
  const interpolationState = new Map<string, InterpolationState>()
  const predictionHistory = new Map<string, PredictionHistoryState>()
  const stationPopupRequests = new Map<string, Promise<void>>()
  const stationPopupCache = new Map<string, { html: string; loadedAt: number }>()

  let pollIntervalId: number | null = null
  const bootstrapTimeoutIds: number[] = []
  let isPolling = false

  const statusText = computed(() => {
    if (errorMessage.value) {
      return 'Problema de conexión'
    }

    if (isLoading.value) {
      return 'Cargando red'
    }

    if (!lastUpdatedAt.value) {
      if (noServiceLikely.value) {
        return 'Sin servicio ahora'
      }

      return 'Buscando autobuses'
    }

    if (noServiceLikely.value && activeBusCount.value === 0) {
      return 'Sin servicio ahora'
    }

    if (activeBusCount.value === 0) {
      return `Sin buses · ${formatTimestamp(lastUpdatedAt.value)}`
    }

    if (bootstrapSampleCount.value < MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT) {
      return `Iniciando ${bootstrapSampleCount.value}/${MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT}`
    }

    return `Act. ${formatTimestamp(lastUpdatedAt.value)}`
  })

  const resolveLineName = (lineRef: string): string =>
    linesCache.value.find((line) => line.ref === lineRef)?.name ?? lineRef

  onMounted(async () => {
    const isMobileViewport = window.matchMedia(MOBILE_MEDIA_QUERY).matches

    map.value = L.map(MAP_ELEMENT_ID, {
      zoomControl: false,
    }).setView([MAP_DEFAULT_CENTER.lat, MAP_DEFAULT_CENTER.lng], MAP_DEFAULT_CENTER.zoom)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map.value)

    L.control.zoom({ position: isMobileViewport ? 'bottomright' : 'topright' }).addTo(map.value)

    setupMapPanes(map.value)

    try {
      await loadTopology()
      startPolling()
    } catch (error) {
      handleError(error, 'No se ha podido cargar la red de transporte de Leioa.')
    } finally {
      isLoading.value = false
    }
  })

  onBeforeUnmount(() => {
    if (pollIntervalId !== null) {
      window.clearInterval(pollIntervalId)
    }

    bootstrapTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeBusLayers.forEach((marker) => marker.remove())
    activeBusLayers.clear()
    interpolationState.clear()
    predictionHistory.clear()
    stationPopupRequests.clear()
    stationPopupCache.clear()
    map.value?.remove()
  })

  async function loadTopology(): Promise<void> {
    const mapInstance = map.value
    if (!mapInstance) {
      return
    }

    const topology = await getTopology()
    stationsCache.value = topology.stations
    linesCache.value = topology.lines.map((line) => enrichLine(line))

    linesCache.value.forEach((line) => {
      const color = LINE_COLORS[line.ref] ?? '#5c1810'
      L.geoJSON(getDisplayGeometry(line.encodedPath), {
        style: { color, weight: 6, opacity: 0.8 },
        pane: 'linesPane',
      })
        .addTo(mapInstance)
        .bindPopup(`<b>${line.name}</b>`)
    })

    const stationIcon = L.divIcon({
      className: 'station-marker',
      html: '<div></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
      popupAnchor: [0, -10],
    })

    stationsCache.value.forEach((station) => {
      const marker = L.marker([station.lat, station.lng], {
        icon: stationIcon,
        pane: 'stationsPane',
        riseOnHover: true,
      })
        .addTo(mapInstance)
        .bindPopup('<div class="popup-loading">Cargando autobuses en tiempo real...</div>')

      marker.on('popupopen', () => {
        void loadStationPopup(marker, station)
      })
    })
  }

  function startPolling(): void {
    void pollBuses()
    MAP_BOOTSTRAP_POLL_DELAYS_MS.forEach((delayMs) => {
      const timeoutId = window.setTimeout(() => {
        void pollBuses()
      }, delayMs)
      bootstrapTimeoutIds.push(timeoutId)
    })
    pollIntervalId = window.setInterval(() => {
      void pollBuses()
    }, MAP_POLL_INTERVAL_MS)
  }

  async function pollBuses(): Promise<void> {
    if (isPolling || stationsCache.value.length === 0) {
      return
    }

    isPolling = true

    try {
      const results: StationArrivals[] = await Promise.all(
        stationsCache.value.map(async (station) => ({
          station,
          arrivals: await getArrivals(station.id),
        })),
      )

      const successfulPollCount = registerSuccessfulPoll()
      const activeBusGroups = collectActiveBuses(results)
      registerActiveBusWindow(activeBusGroups.length)
      syncBusMarkers(activeBusGroups, successfulPollCount)
      lastUpdatedAt.value = new Date()
      errorMessage.value = null
    } catch (error) {
      handleError(error, 'Las llegadas en tiempo real no están disponibles temporalmente.')
    } finally {
      isPolling = false
    }
  }

  function syncBusMarkers(activeBusGroups: ActiveBusGroup[], successfulPollCount: number): void {
    removeInactiveBuses(new Set(activeBusGroups.map((group) => group.trackingKey)))
    const nextDiagnostics: BusTrackingDiagnostic[] = []
    const snapshotContext = buildSnapshotContext(activeBusGroups)

    activeBusGroups.forEach((group) => {
      const { busId, lineRef, predictions, trackingKey } = group
      predictions.sort((left, right) => left.minutes - right.minutes)
      const closestPrediction = predictions[0]

      if (isPersistedGhost(trackingKey, closestPrediction)) {
        return
      }

      const routeLine = linesCache.value.find((line) => line.ref === lineRef)
      if (!routeLine) {
        return
      }

      const historyState = updatePredictionHistory(
        predictionHistory,
        trackingKey,
        closestPrediction,
      )
      const rawElapsedMinutes = getElapsedMinutes(trackingKey, closestPrediction)
      const elapsedMinutes =
        successfulPollCount >= MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT ? rawElapsedMinutes : 0
      const exactMinutesAway = Math.max(0, closestPrediction.minutes - elapsedMinutes)
      const resolvedSegment = resolveBusSegment(routeLine, predictions)
      const segmentProgress = resolvedSegment
        ? calculateSegmentProgress(exactMinutesAway, resolvedSegment.estimatedSegmentMinutes)
        : 0

      const confidence = assessPredictionConfidence(
        routeLine,
        predictions,
        historyState,
        snapshotContext.get(trackingKey) ?? EMPTY_SNAPSHOT_CONTEXT,
      )
      const renderState = resolveBusRenderState(
        closestPrediction,
        resolvedSegment,
        confidence,
        historyState,
        successfulPollCount,
      )
      const suppressionReason = resolveSuppressionReason(
        closestPrediction,
        elapsedMinutes,
        confidence,
      )
      const isSuppressed = suppressionReason !== null

      nextDiagnostics.push(
        buildBusTrackingDiagnostic({
          trackingKey,
          busId,
          lineName: routeLine.name,
          prediction: closestPrediction,
          resolvedSegment,
          exactMinutesAway,
          segmentProgress,
          historyState,
          confidence,
          renderState,
          isSuppressed,
          suppressionReason,
        }),
      )

      if (isSuppressed) {
        persistGhostBus(trackingKey, closestPrediction, suppressionReason)
        removeBus(trackingKey)
        return
      }

      const markerPosition = resolveMarkerPosition(
        renderState,
        routeLine.geoJson,
        resolvedSegment,
        closestPrediction.station.position,
        segmentProgress,
      )

      const [lng, lat] = markerPosition
      renderBusMarker(
        trackingKey,
        busId,
        lat,
        lng,
        closestPrediction,
        routeLine.name,
        confidence.label,
        renderState,
      )
    })

    diagnostics.value = nextDiagnostics
  }

  function getElapsedMinutes(trackingKey: string, prediction: BusPrediction): number {
    const now = Date.now()
    return resolveElapsedMinutes(
      interpolationState,
      trackingKey,
      prediction.minutes,
      prediction.station.id,
      now,
    )
  }

  function renderBusMarker(
    trackingKey: string,
    busId: string,
    lat: number,
    lng: number,
    prediction: BusPrediction,
    lineName: string,
    confidenceLabel: 'high' | 'medium' | 'low',
    renderState: BusTrackingDiagnostic['renderState'],
  ): void {
    const existingMarker = activeBusLayers.get(trackingKey)
    const icon = createBusMarkerIcon()
    const popupContent = buildBusPopup(busId, prediction, lineName, renderState, confidenceLabel)

    if (existingMarker) {
      existingMarker.setLatLng([lat, lng])
      existingMarker.setIcon(icon)
      existingMarker.setPopupContent(popupContent)
      return
    }

    const mapInstance = map.value
    if (!mapInstance) {
      return
    }

    const marker = L.marker([lat, lng], {
      icon,
      pane: 'busesPane',
      zIndexOffset: 1000,
    }).bindPopup(popupContent)

    marker.addTo(mapInstance)
    activeBusLayers.set(trackingKey, marker)
  }

  function removeInactiveBuses(activeBusIds: Set<string>): void {
    activeBusLayers.forEach((marker, trackingKey) => {
      if (activeBusIds.has(trackingKey)) {
        return
      }

      marker.remove()
      activeBusLayers.delete(trackingKey)
      interpolationState.delete(trackingKey)
      predictionHistory.delete(trackingKey)
    })
  }

  function removeBus(trackingKey: string): void {
    const marker = activeBusLayers.get(trackingKey)
    marker?.remove()
    activeBusLayers.delete(trackingKey)
    interpolationState.delete(trackingKey)
    predictionHistory.delete(trackingKey)
  }

  function isPersistedGhost(trackingKey: string, prediction: BusPrediction): boolean {
    const persistedGhost = readGhostBusState(trackingKey)
    if (isGhostPrediction(persistedGhost, prediction)) {
      return true
    }

    if (persistedGhost) {
      localStorage.removeItem(getGhostStorageKey(trackingKey))
    }

    return false
  }

  function persistGhostBus(
    trackingKey: string,
    prediction: BusPrediction,
    reason: GhostSuppressionReason,
  ): void {
    localStorage.setItem(
      getGhostStorageKey(trackingKey),
      JSON.stringify({
        minutes: prediction.minutes,
        stationId: prediction.station.id,
        reason,
      } satisfies GhostBusState),
    )
  }

  function readGhostBusState(trackingKey: string): GhostBusState | null {
    const rawValue = localStorage.getItem(getGhostStorageKey(trackingKey))
    if (!rawValue) {
      return null
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<GhostBusState>
      if (!parsed.stationId || typeof parsed.minutes !== 'number') {
        localStorage.removeItem(getGhostStorageKey(trackingKey))
        return null
      }

      return {
        minutes: parsed.minutes,
        stationId: parsed.stationId,
        reason: parsed.reason ?? 'elapsed_timeout',
      }
    } catch {
      localStorage.removeItem(getGhostStorageKey(trackingKey))
      return null
    }
  }

  function getGhostStorageKey(trackingKey: string): string {
    return `ghost_bus_${trackingKey}`
  }

  function handleError(error: unknown, fallbackMessage: string): void {
    console.error(error)
    errorMessage.value = error instanceof Error ? error.message : fallbackMessage
  }

  async function loadStationPopup(marker: L.Marker, station: Station): Promise<void> {
    const cached = stationPopupCache.get(station.id)
    if (cached && Date.now() - cached.loadedAt <= MAP_POLL_INTERVAL_MS) {
      marker.setPopupContent(cached.html)
      return
    }

    const existingRequest = stationPopupRequests.get(station.id)
    if (existingRequest) {
      return existingRequest
    }

    marker.setPopupContent('<div class="popup-loading">Cargando autobuses en tiempo real...</div>')

    const request = (async () => {
      try {
        const arrivals = await getArrivals(station.id)
        const popupHtml = buildArrivalsPopup(station, arrivals, resolveLineName)
        stationPopupCache.set(station.id, {
          html: popupHtml,
          loadedAt: Date.now(),
        })
        marker.setPopupContent(popupHtml)
      } catch (error) {
        console.error(error)
        marker.setPopupContent(
          `<h3>${station.name}</h3><p class="popup-error">No se han podido cargar las llegadas en tiempo real.</p>`,
        )
      } finally {
        stationPopupRequests.delete(station.id)
      }
    })()

    stationPopupRequests.set(station.id, request)
    await request
  }

  function registerSuccessfulPoll(): number {
    bootstrapSampleCount.value = Math.min(
      MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT,
      bootstrapSampleCount.value + 1,
    )

    return bootstrapSampleCount.value
  }

  function registerActiveBusWindow(activeCount: number): void {
    activeBusCount.value = activeCount

    if (activeCount > 0) {
      hasObservedActiveBus.value = true
      zeroActivePolls.value = 0
      noServiceLikely.value = false
      return
    }

    zeroActivePolls.value += 1

    if (hasObservedActiveBus.value) {
      noServiceLikely.value = false
      return
    }

    const localHour = getLocalHourInTimeZone(new Date(), NO_SERVICE_LOCAL_TIMEZONE)
    const isNoServiceHour = (NO_SERVICE_LOCAL_HOURS as readonly number[]).includes(localHour)
    const threshold = isNoServiceHour
      ? NO_SERVICE_ZERO_ACTIVE_POLLS_NIGHT
      : NO_SERVICE_ZERO_ACTIVE_POLLS_DAY

    noServiceLikely.value = zeroActivePolls.value >= threshold
  }

  return {
    diagnostics,
    errorMessage,
    isLoading,
    statusText,
  }
}

function createBusMarkerIcon(): L.Icon {
  return BUS_MARKER_ICON
}

function enrichLine(line: Line): LineWithGeometry {
  return {
    ...line,
    name: line.ref === 'L.UNICA' ? 'LINEA 3 (UNICA)' : line.name,
    geoJson: decodeLineGeometry(line.encodedPath),
  }
}

function setupMapPanes(mapInstance: L.Map): void {
  mapInstance.createPane('linesPane')
  const linesPane = mapInstance.getPane('linesPane')
  if (linesPane) {
    linesPane.style.zIndex = '400'
  }

  mapInstance.createPane('stationsPane')
  const stationsPane = mapInstance.getPane('stationsPane')
  if (stationsPane) {
    stationsPane.style.zIndex = '500'
  }

  mapInstance.createPane('busesPane')
  const busesPane = mapInstance.getPane('busesPane')
  if (busesPane) {
    busesPane.style.zIndex = '600'
  }
}

function getLocalHourInTimeZone(date: Date, timeZone: string): number {
  const hourText = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date)

  const parsedHour = Number.parseInt(hourText, 10)
  if (Number.isNaN(parsedHour)) {
    return date.getUTCHours()
  }

  return parsedHour % 24
}
