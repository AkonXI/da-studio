<script setup lang="ts">
import { computed, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger' | 'muted' | 'table'
    size?: 'sm' | 'default' | 'lg' | 'icon'
    loading?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'default', size: 'default', loading: false, type: 'button' }
)
const attrs = useAttrs()
const disabled = computed(() => props.loading || attrs.disabled === true || attrs.disabled === '')
</script>

<template>
  <button
    v-bind="attrs"
    :type="props.type"
    :disabled="disabled"
    :class="['ui-button', `ui-button--${props.variant}`, `ui-button--${props.size}`]"
  >
    <span v-if="props.loading" class="ui-button-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
