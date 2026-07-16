<script setup lang="ts">
defineProps<{
  statusText: string
  statusTone: 'online' | 'loading' | 'idle' | 'degraded'
}>()
</script>

<template>
  <header class="glass-header">
    <div>
      <h1>Lejoan Busa en directo</h1>
      <p>Leioa Bus Live · llegadas y mapa</p>
    </div>
    <span class="status-pill" :class="`status-pill--${statusTone}`" aria-live="polite">
      <i aria-hidden="true" />
      {{ statusText }}
    </span>
  </header>
</template>

<style scoped>
.glass-header {
  position: absolute;
  top: calc(var(--safe-top) + var(--edge-space));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  padding: 12px 24px;
  border-radius: 50px;
  text-align: left;
}

.glass-header h1 {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: -0.5px;
}

.glass-header p {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-light);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 2px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(0, 78, 77, 0.1);
  color: var(--primary);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.status-pill i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(0, 78, 77, 0.1);
}

.status-pill--online {
  background: rgba(12, 128, 86, 0.11);
  color: #086b49;
}

.status-pill--loading {
  background: rgba(183, 120, 0, 0.12);
  color: #855800;
}

.status-pill--idle {
  background: rgba(66, 78, 88, 0.1);
  color: #4f5a63;
}

.status-pill--degraded {
  background: rgba(215, 38, 56, 0.1);
  color: #9b2530;
}

@media (max-width: 720px) {
  .glass-header {
    top: calc(var(--safe-top) + var(--mobile-edge-space));
    left: calc(var(--safe-left) + var(--mobile-edge-space));
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    transform: none;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 24px;
    gap: 12px;
  }

  .glass-header h1 {
    font-size: 1rem;
  }

  .glass-header p {
    font-size: 0.7rem;
  }

  .status-pill {
    min-height: 30px;
    padding: 0 10px;
    font-size: 0.64rem;
    line-height: 1.2;
    letter-spacing: 0;
    max-width: 62vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
