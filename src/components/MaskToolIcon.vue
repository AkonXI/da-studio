<template>
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="type === 'brush'">
      <path d="m14.5 4.5 5 5L9 20H4v-5Z" />
      <path d="m12 7 5 5M4 20c2-3 1-5 4-5" />
    </template>
    <template v-else-if="type === 'eraser'">
      <path d="m4 15 8.5-9a2 2 0 0 1 2.9 0l3 3a2 2 0 0 1 0 2.8L10.7 20H7Z" />
      <path d="m10 9 6 6M11 20h9" />
    </template>
    <template v-else-if="type === 'polygon'">
      <path d="M5 17 7 6l9-2 4 10-7 6Z" />
      <path d="M12 8v7M8.5 11.5h7" />
    </template>
    <template v-else-if="type === 'inverse-polygon'">
      <path d="M5 17 7 6l9-2 4 10-7 6Z" />
      <path d="M8.5 11.5h7" />
    </template>
    <template v-else-if="type === 'merge'">
      <path d="M9.5 7.5a5 5 0 1 0 0 9M14.5 7.5a5 5 0 1 1 0 9" />
      <path d="M8.5 12h7M12 8.5v7" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import type { MaskTool } from '../engine'

defineProps<{ type: MaskTool }>()
</script>
