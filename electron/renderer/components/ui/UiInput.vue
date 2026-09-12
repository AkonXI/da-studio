<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ default: '' })
</script>

<template>
  <input v-model="model" v-bind="$attrs" class="ui-input" />
</template>
