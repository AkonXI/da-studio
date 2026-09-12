<script setup lang="ts">
import type { ModeType, InteractionMode } from '../engine/model/types'
defineProps<{ type: ModeType | InteractionMode }>()
</script>

<template>
  <svg class="size-[18px] fill-current pointer-events-none" viewBox="0 0 24 24">
    <template v-if="type === 'select'">
      <path
        d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
    <template v-else-if="type === 'draw'">
      <path
        d="M12 20h9"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
    </template>
    <rect
      v-else-if="type === 'rect'"
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    />
    <template v-else-if="type === 'point'">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </template>
    <polyline
      v-else-if="type === 'polyline'"
      points="3,21 9,7 15,15 21,3"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <polygon
      v-else-if="type === 'polygon'"
      points="12,2 22,8 19,21 5,21 2,8"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <template v-else-if="type === 'curve'">
      <path
        d="M3 17C7 5 13 21 21 6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="3" cy="17" r="1.8" />
      <circle cx="21" cy="6" r="1.8" />
    </template>
    <ellipse
      v-else-if="type === 'ellipse'"
      cx="12"
      cy="12"
      rx="9"
      ry="6.5"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    />
    <template v-else-if="type === 'mask'">
      <path
        d="M5 7.5 8.5 4 15 5l4 4-1.5 7-5 4-6-2-2-5z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="m7 15 6-6m-3 8 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </template>
    <template v-else-if="type === 'cuboid'">
      <path
        d="M3 7l8-4 10 5-8 4zM3 7v10l10 4V12M21 8v9l-8 4M11 3v9"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </template>
    <template v-else-if="type === 'joint'">
      <path
        d="M5 5l5 4 4-2 5 5-4 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle v-for="(point, index) in [[5,5],[10,9],[14,7],[19,12],[15,19]]" :key="index" :cx="point[0]" :cy="point[1]" r="1.7" />
    </template>
    <template v-else-if="type === 'sam'">
      <path d="M7 3 6 6 3 7l3 1 1 3 1-3 3-1-3-1Z" />
      <path d="M16 9l-1.2 3.8L11 14l3.8 1.2L16 19l1.2-3.8L21 14l-3.8-1.2Z" />
      <path d="M4 19c4-6 8-10 16-15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.5 2.5" />
    </template>
  </svg>
</template>
