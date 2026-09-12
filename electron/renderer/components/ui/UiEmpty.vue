<script setup lang="ts">
withDefaults(defineProps<{ description?: string }>(), { description: '暂无数据' })
</script>

<template>
  <div class="ui-empty">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 18h32v21H8zM14 18l4-8h12l4 8M8 28h9l3 4h8l3-4h9" />
    </svg>
    <p>{{ description }}</p>
  </div>
</template>
