<script setup lang="ts">
import 'leaflet/dist/leaflet.css'

import BusListPanel from './components/BusListPanel.vue'
import DiagnosticsPanel from './components/DiagnosticsPanel.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import InfoPanel from './components/InfoPanel.vue'
import MapActions from './components/MapActions.vue'
import MapHeader from './components/MapHeader.vue'
import MapLegend from './components/MapLegend.vue'
import { useTransitMap } from './composables/useTransitMap'
import { isDebugEnabled } from './utils/debug'

const {
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
} = useTransitMap()
const debugEnabled = isDebugEnabled()
</script>

<template>
  <div class="app-container">
    <div v-if="isLoading" class="glass-loader" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true" />
      <h2>Cargando red de Leioa...</h2>
    </div>

    <div id="map" />

    <MapHeader :status-text="statusText" :status-tone="statusTone" />

    <MapLegend :visible-lines="visibleLineRefs" @toggle-line="toggleLine" />

    <BusListPanel :buses="visibleBuses" @focus="focusBus" />

    <MapActions @recenter="resetMapView" />

    <InfoPanel />

    <ErrorBanner v-if="errorMessage" :message="errorMessage" />

    <DiagnosticsPanel v-if="debugEnabled" :diagnostics="diagnostics" />
  </div>
</template>

<style scoped>
.glass-loader {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(247, 249, 252, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.glass-loader h2 {
  margin-top: 24px;
  color: var(--primary);
  font-weight: 600;
  letter-spacing: -0.5px;
  animation: pulse 2s infinite ease-in-out;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid var(--glass-border);
  border-top: 4px solid var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }
}
</style>
