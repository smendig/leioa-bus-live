import L from 'leaflet'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import {
  getTransitLineName,
  getTransitLinePresentation,
  MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT,
  MAP_BOOTSTRAP_POLL_DELAYS_MS,
  MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT,
  MAP_DEFAULT_CENTER,
  MAP_IDLE_POLL_INTERVAL_MS,
  MAP_NO_SERVICE_POLL_INTERVAL_MS,
  MAP_POLL_INTERVAL_MS,
  MISSING_BUS_GRACE_POLLS,
  NO_SERVICE_LOCAL_HOURS,
  NO_SERVICE_LOCAL_TIMEZONE,
  NO_SERVICE_ZERO_ACTIVE_POLLS_DAY,
  NO_SERVICE_ZERO_ACTIVE_POLLS_NIGHT,
  PARTIAL_SNAPSHOT_WARNING_POLLS,
} from '../config/transit'
import { MOBILE_MEDIA_QUERY } from '../config/ui'
import { getArrivalsDetailed, getTopology } from '../services/api'
import { decodeLineGeometry, getDisplayGeometry, resolveMarkerPosition } from '../services/geo'
import type {
  ActiveBusGroup,
  BusPrediction,
  BusTrackingDiagnostic,
  InterpolationState,
  LineWithGeometry,
  PredictionHistoryState,
  StationArrivals,
} from '../types/tracking'
import type { Line, Station } from '../types/transit'
import { getPublishedServiceState } from '../utils/serviceSchedule'
import {
  assessPredictionConfidence,
  buildBusTrackingDiagnostic,
  buildSnapshotContext,
  collectActiveBuses,
  EMPTY_SNAPSHOT_CONTEXT,
  resolveBusRenderState,
  resolveBusSegment,
  resolveMissingBus,
  resolveSegmentProgress,
  resolveSuppressionReason,
  updatePredictionHistory,
} from '../utils/tracking'
import { buildArrivalsPopup, buildBusPopup, formatTimestamp } from '../utils/transitFormatters'

const MAP_ELEMENT_ID = 'map'
const BUS_MARKER_ICON_SIZE = [72, 48] as const
const BUS_MARKER_ICON = L.icon({
  iconUrl: `${import.meta.env.BASE_URL}bus-location.png`,
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
  const visibleLineRefs = ref<string[]>([])
  const bootstrapSampleCount = ref(0)
  const activeBusCount = ref(0)
  const zeroActivePolls = ref(0)
  const noServiceLikely = ref(false)
  const serviceDataMissing = ref(false)
  const consecutivePartialPolls = ref(0)

  const stationsCache = ref<Station[]>([])
  const linesCache = ref<LineWithGeometry[]>([])
  const activeBusLayers = new Map<string, L.Marker>()
  const busLineRefs = new Map<string, string>()
  const lineLayers = new Map<string, L.GeoJSON>()
  const interpolationState = new Map<string, InterpolationState>()
  const predictionHistory = new Map<string, PredictionHistoryState>()
  const missingBusPolls = new Map<string, number>()
  const stationPopupRequests = new Map<string, Promise<void>>()
  const stationPopupCache = new Map<string, { html: string; loadedAt: number }>()

  let scheduledPollTimeoutId: number | null = null
  const bootstrapTimeoutIds: number[] = []
  let isPolling = false

  const statusText = computed(() => {
    if (errorMessage.value) {
      return 'Problema de conexión'
    }

    if (serviceDataMissing.value) {
      return `Sin llegadas anunciadas · ${formatTimestamp(lastUpdatedAt.value ?? new Date())}`
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

    return `${activeBusCount.value} ${activeBusCount.value === 1 ? 'bus' : 'buses'} · ${formatTimestamp(lastUpdatedAt.value)}`
  })

  const statusTone = computed<'online' | 'loading' | 'idle' | 'degraded'>(() => {
    if (errorMessage.value) return 'degraded'
    if (serviceDataMissing.value) return 'degraded'
    if (isLoading.value || bootstrapSampleCount.value < MAP_BOOTSTRAP_STATUS_SAMPLE_COUNT) {
      return 'loading'
    }
    if (activeBusCount.value === 0) return 'idle'
    return 'online'
  })

  const visibleBuses = computed(() =>
    diagnostics.value.filter(
      (diagnostic) =>
        !diagnostic.isSuppressed && visibleLineRefs.value.includes(diagnostic.lineRef),
    ),
  )

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
      document.addEventListener('visibilitychange', handleVisibilityChange)
    } catch (error) {
      handleError(error, 'No se ha podido cargar la red de transporte de Leioa.')
    } finally {
      isLoading.value = false
    }
  })

  onBeforeUnmount(() => {
    if (scheduledPollTimeoutId !== null) {
      window.clearTimeout(scheduledPollTimeoutId)
    }

    bootstrapTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    activeBusLayers.forEach((marker) => marker.remove())
    activeBusLayers.clear()
    busLineRefs.clear()
    lineLayers.clear()
    interpolationState.clear()
    predictionHistory.clear()
    missingBusPolls.clear()
    stationPopupRequests.clear()
    stationPopupCache.clear()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
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
    visibleLineRefs.value = linesCache.value.map((line) => line.ref)

    linesCache.value.forEach((line) => {
      const color = getTransitLinePresentation(line.ref).color
      const layer = L.geoJSON(getDisplayGeometry(line.encodedPath), {
        style: { color, weight: 6, opacity: 0.8 },
        pane: 'linesPane',
      })
        .addTo(mapInstance)
        .bindPopup(`<b>${line.name}</b>`)
      lineLayers.set(line.ref, layer)
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
    scheduleNextPoll(MAP_POLL_INTERVAL_MS)
  }

  function scheduleNextPoll(delayMs = getNextPollDelay()): void {
    if (scheduledPollTimeoutId !== null) window.clearTimeout(scheduledPollTimeoutId)
    scheduledPollTimeoutId = window.setTimeout(async () => {
      scheduledPollTimeoutId = null
      if (!document.hidden) await pollBuses()
      scheduleNextPoll()
    }, delayMs)
  }

  function getNextPollDelay(): number {
    if (document.hidden || noServiceLikely.value) return MAP_NO_SERVICE_POLL_INTERVAL_MS
    return activeBusCount.value > 0 ? MAP_POLL_INTERVAL_MS : MAP_IDLE_POLL_INTERVAL_MS
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      scheduleNextPoll(MAP_NO_SERVICE_POLL_INTERVAL_MS)
      return
    }

    void pollBuses()
    scheduleNextPoll()
  }

  async function pollBuses(): Promise<void> {
    if (isPolling || stationsCache.value.length === 0) {
      return
    }

    isPolling = true

    try {
      const results: StationArrivals[] = await Promise.all(
        stationsCache.value.map(async (station) => {
          const result = await getArrivalsDetailed(station.id)
          return { station, ...result }
        }),
      )

      const snapshotCoverageRatio =
        results.length > 0
          ? results.filter((result) => result.isSuccessful).length / results.length
          : 0
      if (snapshotCoverageRatio < 1) {
        consecutivePartialPolls.value += 1
        if (consecutivePartialPolls.value >= PARTIAL_SNAPSHOT_WARNING_POLLS) {
          errorMessage.value =
            'La fuente está respondiendo de forma parcial; se mantiene el último estado completo.'
        }
        return
      }

      consecutivePartialPolls.value = 0
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
    reconcileMissingBuses(new Set(activeBusGroups.map((group) => group.trackingKey)))
    const nextDiagnostics: BusTrackingDiagnostic[] = []
    const snapshotContext = buildSnapshotContext(activeBusGroups)

    activeBusGroups.forEach((group) => {
      const { busId, lineRef, predictions, trackingKey } = group
      predictions.sort((left, right) => left.minutes - right.minutes)
      const closestPrediction = predictions[0]

      const routeLine = linesCache.value.find((line) => line.ref === lineRef)
      if (!routeLine) {
        return
      }

      const historyState = updatePredictionHistory(
        predictionHistory,
        trackingKey,
        closestPrediction,
      )
      const resolvedSegment = resolveBusSegment(routeLine, predictions)
      const progress = resolvedSegment
        ? resolveSegmentProgress(
            interpolationState,
            trackingKey,
            closestPrediction,
            resolvedSegment,
            Date.now(),
          )
        : { progressRatio: 0, segmentElapsedSeconds: 0, predictionAgeSeconds: 0 }
      const segmentProgress =
        successfulPollCount >= MAP_BOOTSTRAP_DRIFT_SAMPLE_COUNT ? progress.progressRatio : 0
      const exactMinutesAway = closestPrediction.minutes

      const confidence = assessPredictionConfidence(
        routeLine,
        predictions,
        historyState,
        snapshotContext.get(trackingKey) ?? EMPTY_SNAPSHOT_CONTEXT,
        progress.predictionAgeSeconds,
      )
      const renderState = resolveBusRenderState(
        closestPrediction,
        resolvedSegment,
        confidence,
        historyState,
        successfulPollCount,
      )
      const suppressionReason = resolveSuppressionReason(confidence)
      const isSuppressed = suppressionReason !== null

      nextDiagnostics.push(
        buildBusTrackingDiagnostic({
          trackingKey,
          busId,
          lineRef,
          lineName: routeLine.name,
          prediction: closestPrediction,
          resolvedSegment,
          exactMinutesAway,
          segmentProgress,
          segmentElapsedSeconds: progress.segmentElapsedSeconds,
          predictionAgeSeconds: progress.predictionAgeSeconds,
          historyState,
          confidence,
          renderState,
          isSuppressed,
          suppressionReason,
        }),
      )

      if (isSuppressed) {
        removeBus(trackingKey, true)
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
        lineRef,
        confidence.label,
        renderState,
        progress.predictionAgeSeconds,
      )
    })

    diagnostics.value = nextDiagnostics
  }

  function renderBusMarker(
    trackingKey: string,
    busId: string,
    lat: number,
    lng: number,
    prediction: BusPrediction,
    lineName: string,
    lineRef: string,
    confidenceLabel: 'high' | 'medium' | 'low',
    renderState: BusTrackingDiagnostic['renderState'],
    predictionAgeSeconds: number,
  ): void {
    const existingMarker = activeBusLayers.get(trackingKey)
    busLineRefs.set(trackingKey, lineRef)
    const icon = createBusMarkerIcon()
    const popupContent = buildBusPopup(
      busId,
      prediction,
      lineName,
      renderState,
      confidenceLabel,
      predictionAgeSeconds,
    )
    const opacity = confidenceLabel === 'high' ? 1 : confidenceLabel === 'medium' ? 0.82 : 0.64

    if (existingMarker) {
      existingMarker.setLatLng([lat, lng])
      existingMarker.setIcon(icon)
      existingMarker.setPopupContent(popupContent)
      existingMarker.setOpacity(opacity)
      syncMarkerVisibility(existingMarker, lineRef)
      missingBusPolls.delete(trackingKey)
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

    if (isLineVisible(lineRef)) marker.addTo(mapInstance)
    marker.setOpacity(opacity)
    activeBusLayers.set(trackingKey, marker)
  }

  function reconcileMissingBuses(activeBusIds: Set<string>): void {
    activeBusLayers.forEach((marker, trackingKey) => {
      const missing = resolveMissingBus(
        missingBusPolls.get(trackingKey) ?? 0,
        activeBusIds.has(trackingKey),
        MISSING_BUS_GRACE_POLLS,
      )
      if (missing.missingPolls === 0) {
        missingBusPolls.delete(trackingKey)
        return
      }

      if (!missing.shouldRemove) {
        missingBusPolls.set(trackingKey, missing.missingPolls)
        marker.setOpacity(0.35)
        return
      }

      removeBus(trackingKey)
    })
  }

  function removeBus(trackingKey: string, preserveTrackingState = false): void {
    const marker = activeBusLayers.get(trackingKey)
    marker?.remove()
    activeBusLayers.delete(trackingKey)
    busLineRefs.delete(trackingKey)
    missingBusPolls.delete(trackingKey)
    if (!preserveTrackingState) {
      interpolationState.delete(trackingKey)
      predictionHistory.delete(trackingKey)
    }
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
        const result = await getArrivalsDetailed(station.id)
        if (!result.isSuccessful) throw new Error(`Arrival request failed for stop ${station.id}`)
        const popupHtml = buildArrivalsPopup(station, result.arrivals, resolveLineName)
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
      zeroActivePolls.value = 0
      noServiceLikely.value = false
      serviceDataMissing.value = false
      return
    }

    zeroActivePolls.value += 1

    const publishedState = getPublishedServiceState(new Date())
    const isNoServiceHour = (NO_SERVICE_LOCAL_HOURS as readonly number[]).includes(
      getLocalHourInTimeZone(new Date(), NO_SERVICE_LOCAL_TIMEZONE),
    )
    const threshold = isNoServiceHour
      ? NO_SERVICE_ZERO_ACTIVE_POLLS_NIGHT
      : NO_SERVICE_ZERO_ACTIVE_POLLS_DAY
    const enoughEmptyPolls = zeroActivePolls.value >= threshold

    noServiceLikely.value = enoughEmptyPolls && publishedState === 'not-scheduled'
    serviceDataMissing.value = enoughEmptyPolls && publishedState === 'expected'
  }

  function resetMapView(): void {
    map.value?.flyTo([MAP_DEFAULT_CENTER.lat, MAP_DEFAULT_CENTER.lng], MAP_DEFAULT_CENTER.zoom, {
      duration: 0.7,
    })
  }

  function isLineVisible(lineRef: string): boolean {
    return visibleLineRefs.value.includes(lineRef)
  }

  function syncMarkerVisibility(marker: L.Marker, lineRef: string): void {
    const mapInstance = map.value
    if (!mapInstance) return

    if (isLineVisible(lineRef)) {
      if (!mapInstance.hasLayer(marker)) marker.addTo(mapInstance)
    } else if (mapInstance.hasLayer(marker)) {
      marker.remove()
    }
  }

  function toggleLine(lineRef: string): void {
    const mapInstance = map.value
    const lineLayer = lineLayers.get(lineRef)
    const willShow = !isLineVisible(lineRef)

    visibleLineRefs.value = willShow
      ? [...visibleLineRefs.value, lineRef]
      : visibleLineRefs.value.filter((ref) => ref !== lineRef)

    if (mapInstance && lineLayer) {
      if (willShow) lineLayer.addTo(mapInstance)
      else lineLayer.remove()
    }

    activeBusLayers.forEach((marker, trackingKey) => {
      if (busLineRefs.get(trackingKey) === lineRef) syncMarkerVisibility(marker, lineRef)
    })
  }

  function focusBus(trackingKey: string): void {
    const marker = activeBusLayers.get(trackingKey)
    const lineRef = busLineRefs.get(trackingKey)
    const mapInstance = map.value
    if (!marker || !lineRef || !mapInstance) return

    if (!isLineVisible(lineRef)) toggleLine(lineRef)
    syncMarkerVisibility(marker, lineRef)
    mapInstance.flyTo(marker.getLatLng(), Math.max(mapInstance.getZoom(), 15), { duration: 0.6 })
    window.setTimeout(() => marker.openPopup(), 650)
  }

  return {
    diagnostics,
    errorMessage,
    focusBus,
    isLoading,
    resetMapView,
    statusText,
    statusTone,
    toggleLine,
    visibleBuses,
    visibleLineRefs,
  }
}

function createBusMarkerIcon(): L.Icon {
  return BUS_MARKER_ICON
}

function enrichLine(line: Line): LineWithGeometry {
  return {
    ...line,
    name: getTransitLineName(line.ref, line.name),
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
