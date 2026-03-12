<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <aside class="error-banner">
    <strong>Servicio en tiempo real degradado.</strong>
    <span>{{ message }}</span>
  </aside>
</template>

<style scoped>
.error-banner {
  position: absolute;
  left: var(--edge-space);
  bottom: calc(var(--safe-bottom) + var(--edge-space));
  z-index: 1000;
  display: grid;
  gap: 4px;
  max-width: min(420px, calc(100vw - (var(--edge-space) * 2)));
  padding: 14px 16px;
  border: 1px solid rgba(215, 38, 56, 0.18);
  border-radius: 18px;
  background: rgba(255, 248, 248, 0.92);
  box-shadow: 0 12px 30px rgba(60, 16, 16, 0.12);
  color: #7d1f27;
}

@media (max-width: 720px) {
  .error-banner {
    left: calc(var(--safe-left) + var(--mobile-edge-space));
    right: calc(var(--safe-right) + var(--mobile-edge-space));
    top: calc(var(--safe-top) + 84px);
    bottom: auto;
    max-width: none;
  }
}
</style>
