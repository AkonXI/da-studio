<script setup lang="ts">
import type { AuxiliaryTool } from '../engine/model/types'

defineProps<{ type: AuxiliaryTool }>()
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="type === 'move'">
      <path
        d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"
      />
    </template>
    <template v-else-if="type === 'reshape-path'">
      <path d="M4 17c4-10 8-10 16-10M4 17l5 2 5-5 6 2" />
      <circle cx="4" cy="17" r="1.8" />
      <circle cx="20" cy="7" r="1.8" />
    </template>
    <template v-else-if="type === 'clip-path'">
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M8.4 15.2L18 5M15.6 15.2L6 5" />
    </template>
    <template v-else>
      <path d="M4 7l6-3 5 4-2 7-7 1zM11 12l5-4 5 3-1 7-7 2-4-4" />
    </template>
  </svg>
</template>

<style scoped>
svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}
</style>
