<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'info' | 'success' | 'warning' }>(), { variant: 'info' })
</script>

<template><span :class="['ui-badge', `ui-badge--${variant}`]"><slot /></span></template>
