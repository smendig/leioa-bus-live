<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import { useTransitMap } from './composables/useTransitMap'

const { diagnostics, errorMessage, isLoading, statusText } = useTransitMap()
const debugEnabled =
  import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1'
</script>

<template>
  <div class="app-container">
    <div
      v-if="isLoading"
      class="glass-loader"
    >
      <div class="spinner" />
      <h2>Loading Leioa Network...</h2>
    </div>

    <div id="map" />

    <header class="glass-header">
      <div>
        <h1>Leioa Bus Live</h1>
        <p>Real-time network overview</p>
      </div>
      <span class="status-pill">{{ statusText }}</span>
    </header>

    <aside
      v-if="errorMessage"
      class="error-banner"
    >
      <strong>Live service degraded.</strong>
      <span>{{ errorMessage }}</span>
    </aside>

    <aside
      v-if="debugEnabled && diagnostics.length > 0"
      class="debug-panel"
    >
      <h2>Tracking diagnostics</h2>
      <ul class="debug-list">
        <li
          v-for="diagnostic in diagnostics"
          :key="diagnostic.trackingKey"
          class="debug-item"
        >
          <strong>Bus {{ diagnostic.busId }} · {{ diagnostic.lineName }}</strong>
          <span>{{ diagnostic.previousStopName }} -> {{ diagnostic.nextStopName }}</span>
          <span>Render state: {{ diagnostic.renderState }}</span>
          <span>ETA next: {{ diagnostic.minutesToNextStop }} min</span>
          <span>Segment: {{ diagnostic.estimatedSegmentMinutes }} min</span>
          <span>Progress: {{ diagnostic.progressRatio }}</span>
          <span>Confidence: {{ diagnostic.confidenceLabel }} ({{ diagnostic.confidenceScore }})</span>
          <span>Repeated polls: {{ diagnostic.repeatedPolls }}</span>
          <span>Same stop polls: {{ diagnostic.sameStopPolls }}</span>
          <span>Low ETA plateau polls: {{ diagnostic.lowEtaPlateauPolls }}</span>
          <span>Route continuity: {{ diagnostic.routeContinuityScore }}</span>
          <span>ETA stability: {{ diagnostic.etaStabilityScore }}</span>
          <span>Plateau score: {{ diagnostic.plateauScore }}</span>
          <span>Context score: {{ diagnostic.contextScore }}</span>
          <span>Same-stop overlap: {{ diagnostic.sameStopOverlapCount }}</span>
          <span>Low ETA overlap: {{ diagnostic.lowEtaSameStopOverlapCount }}</span>
          <span v-if="diagnostic.hotspotLabel">Hotspot: {{ diagnostic.hotspotLabel }}</span>
          <span v-if="diagnostic.hotspotPenalty > 0">Hotspot penalty: {{ diagnostic.hotspotPenalty }}</span>
          <span>ETA increase streak: {{ diagnostic.sameStopEtaIncreaseCount }}</span>
          <span>Large jump streak: {{ diagnostic.largeEtaJumpCount }}</span>
          <span>Route gaps: {{ diagnostic.routeGapCount }}</span>
          <span v-if="diagnostic.isGhostCandidate">Ghost candidate</span>
          <span v-if="diagnostic.isSuppressed">Suppressed: {{ diagnostic.suppressionReason }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>
