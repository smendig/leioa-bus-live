<script setup lang="ts">
import 'leaflet/dist/leaflet.css'

import { ref } from 'vue'

import DiagnosticsPanel from './components/DiagnosticsPanel.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import MapHeader from './components/MapHeader.vue'
import { useTransitMap } from './composables/useTransitMap'
import { MOBILE_MEDIA_QUERY } from './config/ui'
import { isDebugEnabled } from './utils/debug'

const { diagnostics, errorMessage, isLoading, statusText } = useTransitMap()
const debugEnabled = isDebugEnabled()
const isMobileViewport =
  typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches
const debugPanelOpen = ref(!isMobileViewport)
</script>

<template>
  <div class="app-container">
    <div v-if="isLoading" class="glass-loader">
      <div class="spinner" />
      <h2>Cargando red de Leioa...</h2>
    </div>

    <div id="map" />

    <MapHeader :status-text="statusText" />

    <ErrorBanner v-if="errorMessage" :message="errorMessage" />

    <DiagnosticsPanel
      :debug-enabled="debugEnabled"
      :diagnostics="diagnostics"
      :is-open="debugPanelOpen"
      @open="debugPanelOpen = true"
      @close="debugPanelOpen = false"
    />
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
