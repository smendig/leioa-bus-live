<script setup lang="ts">
import { ref } from 'vue'

import { getTransitLinePresentation } from '../config/transit'
import type { BusTrackingDiagnostic } from '../types/tracking'
import { formatBusSignal, formatEta } from '../utils/transitFormatters'

defineProps<{
  buses: BusTrackingDiagnostic[]
}>()

defineEmits<{
  focus: [trackingKey: string]
}>()

const isOpen = ref(false)
</script>

<template>
  <section v-if="buses.length" class="bus-list" aria-label="Autobuses visibles">
    <button
      type="button"
      class="bus-list__toggle"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="bus-list__live-dot" aria-hidden="true" />
      {{ buses.length }} {{ buses.length === 1 ? 'bus' : 'buses' }}
      <span aria-hidden="true">{{ isOpen ? '⌄' : '⌃' }}</span>
    </button>

    <div v-if="isOpen" class="bus-list__panel">
      <button
        v-for="bus in buses"
        :key="bus.trackingKey"
        type="button"
        class="bus-row"
        @click="$emit('focus', bus.trackingKey)"
      >
        <span
          class="bus-row__line"
          :style="{ backgroundColor: getTransitLinePresentation(bus.lineRef).color }"
        >
          {{ getTransitLinePresentation(bus.lineRef).shortLabel }}
        </span>
        <span class="bus-row__main">
          <strong>Bus {{ bus.busId }}</strong>
          <small>{{ bus.nextStopName }}</small>
          <small class="bus-row__confidence" :class="`is-${bus.confidenceLabel}`">
            {{ formatBusSignal(bus.confidenceLabel, bus.predictionAgeSeconds) }}
          </small>
        </span>
        <strong class="bus-row__eta">{{ formatEta(bus.minutesToNextStop) }}</strong>
      </button>
    </div>
  </section>
</template>

<style scoped>
.bus-list {
  position: absolute;
  left: calc(var(--safe-left) + var(--edge-space));
  bottom: calc(var(--safe-bottom) + 92px);
  z-index: 901;
  width: min(340px, calc(100vw - 32px));
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 7px;
}

.bus-list__toggle,
.bus-list__panel {
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  box-shadow: 0 8px 24px rgba(20, 41, 40, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.bus-list__toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 8px 11px;
  border-radius: 12px;
  color: var(--text-dark);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
}

.bus-list__live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1c9a68;
  box-shadow: 0 0 0 3px rgba(28, 154, 104, 0.14);
}

.bus-list__panel {
  width: 100%;
  max-height: min(46vh, 310px);
  overflow-y: auto;
  padding: 5px;
  border-radius: 14px;
}

.bus-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border: 0;
  border-radius: 10px;
  color: var(--text-dark);
  background: transparent;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.bus-row:hover,
.bus-row:focus-visible {
  background: rgba(255, 255, 255, 0.7);
  outline: none;
}

.bus-row__line {
  padding: 4px 6px;
  border-radius: 7px;
  background: var(--primary);
  color: white;
  font-size: 0.68rem;
  font-weight: 900;
}

.bus-row__main {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.bus-row__main strong,
.bus-row__main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bus-row__main strong,
.bus-row__eta {
  font-size: 0.75rem;
}

.bus-row__main small {
  color: var(--text-light);
  font-size: 0.66rem;
}

.bus-row__confidence::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 4px;
  border-radius: 50%;
  background: #1c9a68;
}

.bus-row__confidence.is-medium::before {
  background: #c58418;
}

.bus-row__confidence.is-low::before {
  background: #b44a45;
}

.bus-row__eta {
  color: var(--primary);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .bus-list {
    left: calc(var(--safe-left) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + 84px);
    width: min(320px, calc(100vw - 24px));
  }
}
</style>
