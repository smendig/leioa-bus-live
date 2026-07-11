<script setup lang="ts">
defineEmits<(event: 'recenter') => void>()
</script>

<template>
  <div class="map-actions" aria-label="Acciones del mapa">
    <button
      type="button"
      title="Volver a Leioa"
      aria-label="Volver a Leioa"
      @click="$emit('recenter')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.map-actions {
  position: absolute;
  right: calc(var(--safe-right) + var(--edge-space));
  bottom: calc(var(--safe-bottom) + var(--edge-space));
  z-index: 900;
}

.map-actions button {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: var(--glass-bg);
  box-shadow: 0 8px 24px rgba(20, 41, 40, 0.12);
  color: var(--primary);
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.map-actions button:hover {
  background: white;
}

.map-actions button:focus-visible {
  outline: 3px solid rgba(0, 157, 154, 0.28);
  outline-offset: 2px;
}

.map-actions svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2;
}

@media (max-width: 720px) {
  .map-actions {
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + 106px);
  }
}
</style>
