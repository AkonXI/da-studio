<script setup lang="ts">
import { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastViewport } from 'reka-ui'
import { useToast } from '../../composables/useToast'

const toast = useToast()
</script>

<template>
  <ToastProvider :duration="2600" swipe-direction="right">
    <ToastRoot
      v-for="item in toast.items.value"
      :key="item.id"
      v-model:open="item.open"
      :class="['ui-toast', `ui-toast--${item.tone}`]"
      @update:open="(open) => !open && toast.remove(item.id)"
    >
      <span class="ui-toast-mark" aria-hidden="true" />
      <ToastDescription class="ui-toast-description">{{ item.title }}</ToastDescription>
      <ToastClose class="ui-toast-close" aria-label="关闭通知">×</ToastClose>
    </ToastRoot>
    <ToastViewport class="ui-toast-viewport" />
  </ToastProvider>
</template>
