<script setup lang="ts">
import { TRANSIT_LINES } from '../config/transit'

defineProps<{
  visibleLines: string[]
}>()

defineEmits<{
  toggleLine: [lineRef: string]
}>()
</script>

<template>
  <aside class="map-legend" aria-label="Filtrar líneas del mapa">
    <div class="legend-lines">
      <button
        v-for="line in TRANSIT_LINES"
        :key="line.ref"
        type="button"
        :class="{ 'is-hidden': !visibleLines.includes(line.ref) }"
        :aria-pressed="visibleLines.includes(line.ref)"
        :aria-label="`${visibleLines.includes(line.ref) ? 'Ocultar' : 'Mostrar'} línea ${line.shortLabel}`"
        @click="$emit('toggleLine', line.ref)"
      >
        <i class="line-dot" :style="{ backgroundColor: line.color }" />{{ line.shortLabel }}
      </button>
    </div>
    <p>Posiciones estimadas</p>
  </aside>
</template>

<style scoped>
.map-legend {
  position: absolute;
  left: calc(var(--safe-left) + var(--edge-space));
  bottom: calc(var(--safe-bottom) + var(--edge-space));
  z-index: 900;
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: var(--glass-bg);
  box-shadow: 0 8px 24px rgba(20, 41, 40, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.legend-lines {
  display: flex;
  gap: 4px;
}

.legend-lines button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 4px 7px;
  border: 0;
  border-radius: 8px;
  color: var(--text-dark);
  background: rgba(255, 255, 255, 0.48);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  transition:
    opacity 160ms ease,
    background 160ms ease;
}

.legend-lines button:hover,
.legend-lines button:focus-visible {
  background: rgba(255, 255, 255, 0.9);
  outline: none;
}

.legend-lines button:focus-visible {
  box-shadow: 0 0 0 2px var(--primary);
}

.legend-lines button.is-hidden {
  opacity: 0.42;
}

.line-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
}

.map-legend p {
  color: var(--text-light);
  font-size: 0.66rem;
  font-weight: 600;
}

@media (max-width: 720px) {
  .map-legend {
    left: calc(var(--safe-left) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + var(--mobile-edge-space));
    padding: 8px 9px;
  }
}
</style>
