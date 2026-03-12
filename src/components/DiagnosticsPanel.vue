<script setup lang="ts">
import { computed } from 'vue'

import type { BusTrackingDiagnostic } from '../types/tracking'

const props = defineProps<{
  debugEnabled: boolean
  diagnostics: BusTrackingDiagnostic[]
  isOpen: boolean
}>()

const emit = defineEmits<(event: 'open' | 'close') => void>()

const hasDiagnostics = computed(() => props.debugEnabled && props.diagnostics.length > 0)
</script>

<template>
  <button
    v-if="hasDiagnostics && !props.isOpen"
    type="button"
    class="debug-toggle debug-toggle--show"
    @click="emit('open')"
  >
    Show diagnostics
  </button>

  <aside v-if="hasDiagnostics && props.isOpen" class="debug-panel">
    <div class="debug-panel-header">
      <h2>Tracking diagnostics</h2>
      <button type="button" class="debug-toggle debug-toggle--hide" @click="emit('close')">
        Hide
      </button>
    </div>
    <ul class="debug-list">
      <li v-for="diagnostic in props.diagnostics" :key="diagnostic.trackingKey" class="debug-item">
        <strong>Bus {{ diagnostic.busId }} · {{ diagnostic.lineName }}</strong>
        <span>{{ diagnostic.previousStopName }} -> {{ diagnostic.nextStopName }}</span>
        <span>Render state: {{ diagnostic.renderState }}</span>
        <span>ETA next: {{ diagnostic.minutesToNextStop }} min</span>
        <span>Segment: {{ diagnostic.estimatedSegmentMinutes }} min</span>
        <span>Progress: {{ diagnostic.progressRatio }}</span>
        <span>Confidence: {{ diagnostic.confidenceLabel }} ({{ diagnostic.confidenceScore }})</span>
        <span>Polls observed: {{ diagnostic.pollsObserved }}</span>
        <span>Station changes: {{ diagnostic.stationChanges }}</span>
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
        <span v-if="diagnostic.hotspotPenalty > 0"
          >Hotspot penalty: {{ diagnostic.hotspotPenalty }}</span
        >
        <span>ETA increase streak: {{ diagnostic.sameStopEtaIncreaseCount }}</span>
        <span>Large jump streak: {{ diagnostic.largeEtaJumpCount }}</span>
        <span>Route gaps: {{ diagnostic.routeGapCount }}</span>
        <span v-if="diagnostic.isGhostCandidate">Ghost candidate</span>
        <span v-if="diagnostic.isSuppressed">Suppressed: {{ diagnostic.suppressionReason }}</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.debug-panel {
  position: absolute;
  right: var(--edge-space);
  bottom: calc(var(--safe-bottom) + var(--edge-space));
  z-index: 1000;
  width: min(360px, calc(100vw - (var(--edge-space) * 2)));
  max-height: min(60vh, 560px);
  overflow: auto;
  padding: 14px 16px;
  border: 1px solid rgba(0, 78, 77, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(20, 41, 40, 0.12);
  color: var(--text-dark);
}

.debug-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.debug-panel h2 {
  margin: 0;
  color: var(--primary);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.debug-toggle {
  border: 1px solid rgba(0, 78, 77, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--primary);
  padding: 8px 12px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  cursor: pointer;
}

.debug-toggle--show {
  position: absolute;
  right: var(--edge-space);
  bottom: calc(var(--safe-bottom) + var(--edge-space));
  z-index: 1001;
}

.debug-toggle--hide {
  position: static;
}

.debug-list {
  display: grid;
  gap: 10px;
  list-style: none;
}

.debug-item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 78, 77, 0.05);
  font-size: 0.82rem;
}

.debug-item strong {
  color: var(--primary);
}

@media (max-width: 720px) {
  .debug-panel {
    left: calc(var(--safe-left) + var(--mobile-edge-space));
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + var(--mobile-edge-space));
    width: auto;
    max-height: min(40vh, 280px);
    overflow: auto;
  }

  .debug-toggle--show {
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + 106px);
  }
}
</style>
