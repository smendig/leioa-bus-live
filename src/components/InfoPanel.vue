<template>
  <details class="map-info">
    <summary>Información</summary>
    <section class="map-info__content">
      <h2>Lejoan Busa en directo</h2>
      <p>
        Consulta las próximas llegadas y el recorrido de las líneas L1, L2 y L3 del autobús urbano
        de Leioa.
      </p>
      <p>
        Las posiciones del mapa son estimaciones calculadas a partir de las previsiones de llegada;
        no son coordenadas GPS.
      </p>
      <a href="https://lejoanbusa.eus/es/" target="_blank" rel="noopener noreferrer">
        Web oficial de Lejoan Busa
      </a>
      <small>Proyecto público no oficial y sin relación con el Ayuntamiento de Leioa.</small>
    </section>
  </details>
</template>

<style scoped>
.map-info {
  position: absolute;
  right: calc(var(--safe-right) + var(--edge-space));
  bottom: calc(var(--safe-bottom) + 76px);
  z-index: 902;
}

.map-info summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  padding: 8px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  background: var(--glass-bg);
  box-shadow: 0 8px 24px rgba(20, 41, 40, 0.12);
  color: var(--text-dark);
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.map-info summary::-webkit-details-marker {
  display: none;
}

.map-info summary::before {
  content: 'i';
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-size: 0.68rem;
  font-family: serif;
  font-weight: 800;
}

.map-info summary:focus-visible {
  outline: 3px solid rgba(0, 157, 154, 0.28);
  outline-offset: 2px;
}

.map-info__content {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: min(320px, calc(100vw - 32px));
  display: grid;
  gap: 9px;
  padding: 16px;
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 30px rgba(20, 41, 40, 0.15);
  color: var(--text-dark);
}

.map-info__content h2 {
  color: var(--primary);
  font-size: 1rem;
}

.map-info__content p,
.map-info__content small {
  font-size: 0.74rem;
  line-height: 1.45;
}

.map-info__content small {
  color: var(--text-light);
}

.map-info__content a {
  color: var(--primary);
  font-size: 0.75rem;
  font-weight: 800;
  text-underline-offset: 2px;
}

@media (max-width: 720px) {
  .map-info {
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    bottom: calc(var(--safe-bottom) + 162px);
  }

  .map-info summary {
    padding: 8px 10px;
  }

  .map-info__content {
    width: min(310px, calc(100vw - 24px));
  }
}
</style>
