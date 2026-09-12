<template>
  <footer class="da-statusbar">
    <span class="da-statusbar-item">
      分组
      <i :style="{ background: groupColor }" />
      <strong :style="{ color: groupColor }">{{ groupLabel }}</strong>
    </span>

    <div class="da-status-tools">
      <button
        type="button"
        class="da-status-tool"
        :disabled="readonly || !canUndo"
        :title="`撤销${undoShortcut ? ` (${undoShortcut})` : ''}`"
        aria-label="撤销"
        @click="$emit('undo')"
      >
        <ToolIcon type="undo" />
      </button>
      <button
        type="button"
        class="da-status-tool"
        :disabled="readonly || !canRedo"
        :title="`重做${redoShortcut ? ` (${redoShortcut})` : ''}`"
        aria-label="重做"
        @click="$emit('redo')"
      >
        <ToolIcon type="redo" />
      </button>
    </div>

    <div class="da-image-adjust">
      <button
        type="button"
        class="da-image-adjust-trigger"
        :class="{ active: imageAdjustOpen }"
        title="图像调节"
        aria-label="图像调节"
        @click="imageAdjustOpen = !imageAdjustOpen"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" />
        </svg>
      </button>
      <div v-if="imageAdjustOpen" class="da-image-adjust-popover">
        <div class="da-image-adjust-heading">
          <strong>图像调节</strong>
          <button type="button" class="da-reset-textbtn" @click="$emit('reset-adjustments')">重置</button>
        </div>
        <label v-for="item in adjustmentItems" :key="item.key">
          <span>{{ item.label }}</span>
          <input
            :value="imageAdjustments[item.key]"
            type="range"
            min="0"
            max="200"
            step="1"
            @input="updateAdjustment(item.key, $event)"
          />
          <b>{{ imageAdjustments[item.key] }}%</b>
        </label>
      </div>
    </div>

    <div class="da-status-tools">
      <button
        type="button"
        class="da-status-tool"
        :class="{ active: labelsVisible }"
        :title="`${labelsVisible ? '隐藏' : '显示'}标注标签${labelShortcut ? ` (${labelShortcut})` : ''}`"
        @click="$emit('toggle-labels')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
      </button>
      <button
        type="button"
        class="da-status-tool"
        :class="{ active: gridVisible }"
        :title="gridVisible ? '关闭画布网格' : '开启画布网格'"
        @click="$emit('toggle-grid')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
        </svg>
      </button>
      <button
        type="button"
        class="da-status-tool"
        :class="{ active: crosshairVisible }"
        :title="crosshairVisible ? '关闭鼠标十字线' : '开启鼠标十字线'"
        @click="$emit('toggle-crosshair')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" /><path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
        </svg>
      </button>
      <button type="button" class="da-status-tool" title="图片逆时针旋转 90°" @click="$emit('rotate', -1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V3L2 6l3 3V7a8 8 0 11-1 9" /></svg>
      </button>
      <span class="da-rotation-value">{{ rotation * 90 }}°</span>
      <button type="button" class="da-status-tool" title="图片顺时针旋转 90°" @click="$emit('rotate', 1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7V3l3 3-3 3V7a8 8 0 101 9" /></svg>
      </button>
    </div>

    <span class="da-statusbar-spacer" />
    <span class="da-statusbar-mode">{{ interactionMode === 'draw' ? '绘制' : '编辑' }}</span>
    <button
      type="button"
      class="da-status-tool"
      :title="`缩小${zoomOutShortcut ? ` (${zoomOutShortcut})` : ''}`"
      aria-label="缩小"
      @click="$emit('zoom', -0.1)"
    >
      <ToolIcon type="zoom-out" />
    </button>
    <button
      type="button"
      class="da-status-tool"
      :title="`放大${zoomInShortcut ? ` (${zoomInShortcut})` : ''}`"
      aria-label="放大"
      @click="$emit('zoom', 0.1)"
    >
      <ToolIcon type="zoom-in" />
    </button>
    <button type="button" class="da-status-tool" title="适应图片大小" aria-label="适应图片大小" @click="$emit('fit-image')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /><rect x="7" y="8" width="10" height="8" rx="1" />
      </svg>
    </button>
    <span class="da-statusbar-coordinates">
      ({{ pointerPosition ? pointerPosition.x.toFixed(1) : '—' }},
      {{ pointerPosition ? pointerPosition.y.toFixed(1) : '—' }})
      <strong>{{ Math.round(scale * 100) }}%</strong>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ImageAdjustments, InteractionMode, Point } from '../../engine/model/types'
import ToolIcon from '../ToolIcon.vue'

defineProps<{
  groupLabel: string
  groupColor: string
  interactionMode: InteractionMode
  pointerPosition: Point | null
  scale: number
  imageAdjustments: ImageAdjustments
  labelsVisible: boolean
  gridVisible: boolean
  crosshairVisible: boolean
  rotation: number
  readonly: boolean
  canUndo: boolean
  canRedo: boolean
  labelShortcut?: string
  zoomOutShortcut?: string
  zoomInShortcut?: string
  undoShortcut?: string
  redoShortcut?: string
}>()

const emit = defineEmits<{
  'reset-adjustments': []
  'update-adjustment': [key: keyof ImageAdjustments, value: number]
  'toggle-labels': []
  'toggle-grid': []
  'toggle-crosshair': []
  rotate: [step: number]
  'fit-image': []
  zoom: [delta: number]
  undo: []
  redo: []
}>()

const imageAdjustOpen = ref(false)
const adjustmentItems: { key: keyof ImageAdjustments; label: string }[] = [
  { key: 'brightness', label: '亮度' },
  { key: 'contrast', label: '对比度' },
  { key: 'saturation', label: '饱和度' }
]

function updateAdjustment(key: keyof ImageAdjustments, event: Event): void {
  emit('update-adjustment', key, Number((event.target as HTMLInputElement).value))
}
</script>
