<template>
  <aside class="map-legend" aria-label="Leyenda del mapa">
    <div class="legend-lines">
      <span><i class="line-dot line-dot--one" />L1</span>
      <span><i class="line-dot line-dot--two" />L2</span>
      <span><i class="line-dot line-dot--three" />L3</span>
    </div>
    <p>Las posiciones son estimadas</p>
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
  gap: 12px;
}

.legend-lines span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dark);
  font-size: 0.72rem;
  font-weight: 800;
}

.line-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--primary);
}

.line-dot--two {
  background: #009d9a;
}

.line-dot--three {
  background: #d72638;
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
    padding: 9px 11px;
  }
}
</style>
