<template>
  <div class="da-main-toolbar w-[88px] shrink-0 h-full border-0 border-r px-[7px] py-[9px] flex flex-col gap-1.5 bg-[var(--da-annotator-panel-bg)] border-[var(--da-annotator-border)]">
    <div class="grid grid-cols-2 gap-1">
      <button :class="[buttonClass, { [activeClass]: interactionMode === 'select' }]" :disabled="readonly" :title="`选择模式 (${shortcutFor('toggle-interaction')})`" @click="$emit('interaction', 'select')">
        <ModeIcon type="select" />
      </button>
      <button :class="[buttonClass, { [activeClass]: interactionMode === 'draw' }]" :disabled="readonly" :title="`绘制模式 (${shortcutFor('toggle-interaction')})`" @click="$emit('interaction', 'draw')">
        <ModeIcon type="draw" />
      </button>
    </div>
    <div class="h-px mx-1 bg-[var(--da-annotator-divider)]" />
    <div class="grid grid-cols-2 gap-1">
      <button
        v-for="item in modes"
        :key="item.type"
        :class="[buttonClass, { '!bg-[var(--da-annotator-mode-selected-bg)] !border-[var(--da-annotator-mode-selected-border)]': mode === item.type && interactionMode === 'draw' }]"
        :disabled="!item.enabled || interactionMode === 'select' || readonly"
        :title="`${item.label} (${shortcutFor(`tool-${item.type}`)})`"
        @click="$emit('mode', item.type)"
      >
        <ModeIcon :type="item.type" />
      </button>
    </div>
    <div class="h-px mx-1 bg-[var(--da-annotator-divider)]" />
    <div class="grid grid-cols-2 gap-1">
      <button
        v-for="(item, index) in groups"
        :key="item.name"
        class="aspect-square border-2 rounded-md cursor-pointer transition-all duration-[120ms] hover:opacity-85 disabled:opacity-30 disabled:cursor-default border-transparent"
        :class="{ '!border-[var(--da-annotator-group-selected-border)]': group === item.name }"
        :disabled="readonly"
        :title="index < 4 ? `${item.label} (${shortcutFor(`group-${index + 1}`)})` : item.label"
        :style="{ background: item.stroke }"
        @click="$emit('group', item.name)"
      />
    </div>
    <button v-show="continuousActive && !readonly" class="px-1.5 py-[5px] text-[10px] font-bold border rounded-md disabled:cursor-default text-[var(--da-annotator-action-fg)] bg-[var(--da-annotator-primary-bg)] border-[var(--da-annotator-primary-border)] hover:enabled:bg-[var(--da-annotator-primary-hover-bg)] disabled:bg-[var(--da-annotator-primary-disabled-bg)]" :disabled="!canComplete" :title="`完成 (${shortcutFor('complete-shape')})`" @click="$emit('complete')">完成</button>
    <button v-show="continuousActive && !readonly" class="px-1.5 py-[5px] text-[10px] font-bold border rounded-md text-[var(--da-annotator-danger-soft-fg)] bg-[var(--da-annotator-danger-soft-bg)] border-[var(--da-annotator-danger-soft-border)]" :title="`取消 (${shortcutFor('cancel-shape')})`" @click="$emit('cancel')">取消</button>
    <button v-show="hasSelected && !readonly" class="px-1.5 py-[5px] text-[10px] font-bold border rounded-md text-[var(--da-annotator-action-fg)] bg-[var(--da-annotator-danger-bg)] border-[var(--da-annotator-danger-border)] hover:enabled:bg-[var(--da-annotator-danger-hover-bg)]" :title="`删除选中 (${shortcutFor('delete-selected')})`" @click="$emit('delete')">删除</button>
    <button :class="`${buttonClass} mt-auto hover:enabled:!bg-[var(--da-annotator-danger-soft-bg)] hover:enabled:!text-[var(--da-annotator-danger-soft-fg)] hover:enabled:!border-[var(--da-annotator-danger-soft-border)]`" :disabled="readonly" :title="`清空全部 (${shortcutFor('clear-all')})`" @click="$emit('clear')"><ToolIcon type="trash" /></button>
  </div>
</template>

<script setup lang="ts">
import type { Group, InteractionMode, ModeType } from '../../engine/model/types'
import ModeIcon from '../ModeIcon.vue'
import ToolIcon from '../ToolIcon.vue'

defineProps<{
  readonly: boolean
  interactionMode: InteractionMode
  mode: string
  modes: { type: ModeType; label: string; enabled: boolean }[]
  groups: Group[]
  group: string
  canComplete: boolean
  hasSelected: boolean
  continuousActive: boolean
  shortcutFor: (action: string) => string
}>()

defineEmits<{
  interaction: [mode: InteractionMode]
  mode: [mode: ModeType]
  group: [group: string]
  complete: []
  cancel: []
  delete: []
  clear: []
}>()

const buttonClass = 'aspect-square border rounded-md cursor-pointer flex items-center justify-center transition-all duration-150 relative disabled:opacity-40 disabled:cursor-default bg-[var(--da-annotator-tool-bg)] text-[var(--da-annotator-tool-fg)] border-[var(--da-annotator-border-strong)] hover:enabled:bg-[var(--da-annotator-tool-hover-bg)] active:enabled:bg-[var(--da-annotator-tool-active-bg)]'
const activeClass = '!bg-[var(--da-annotator-selected-bg)] !text-[var(--da-annotator-selected-fg)] !border-[var(--da-annotator-selected-border)]'
</script>
