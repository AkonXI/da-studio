<script setup lang="ts">
defineProps<{ type: 'zoom-out' | 'zoom-in' | 'undo' | 'redo' | 'trash' }>()
</script>

<template>
  <svg class="size-[18px] fill-current pointer-events-none" viewBox="0 0 24 24">
    <!-- zoom-out -->
    <template v-if="type === 'zoom-out'">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <line
        x1="21"
        y1="21"
        x2="16.65"
        y2="16.65"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <line x1="8" y1="11" x2="14" y2="11" fill="none" stroke="currentColor" stroke-width="2" />
    </template>
    <!-- zoom-in -->
    <template v-else-if="type === 'zoom-in'">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <line
        x1="21"
        y1="21"
        x2="16.65"
        y2="16.65"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <line x1="11" y1="8" x2="11" y2="14" fill="none" stroke="currentColor" stroke-width="2" />
      <line x1="8" y1="11" x2="14" y2="11" fill="none" stroke="currentColor" stroke-width="2" />
    </template>
    <!-- undo -->
    <template v-else-if="type === 'undo'">
      <path
        d="M4 4v6h6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6.5 15.5a8 8 0 1 0 3-12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </template>
    <!-- redo -->
    <template v-else-if="type === 'redo'">
      <path
        d="M20 4v6h-6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M17.5 15.5a8 8 0 1 1 3-12"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </template>
    <!-- trash -->
    <template v-else-if="type === 'trash'">
      <polyline
        points="3,6 5,6 21,6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </template>
  </svg>
</template>
