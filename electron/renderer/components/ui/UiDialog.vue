<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    size?: 'sm' | 'md' | 'lg'
    closeDisabled?: boolean
  }>(),
  { description: '', size: 'md', closeDisabled: false }
)
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="ui-dialog-overlay" />
      <DialogContent :class="['ui-dialog-content', `ui-dialog-content--${props.size}`]">
        <header class="ui-dialog-header">
          <div>
            <DialogTitle class="ui-dialog-title">{{ props.title }}</DialogTitle>
            <DialogDescription v-if="props.description" class="ui-dialog-description">
              {{ props.description }}
            </DialogDescription>
          </div>
          <DialogClose
            class="ui-dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="props.closeDisabled"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </DialogClose>
        </header>
        <div class="ui-dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-dialog-footer"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
