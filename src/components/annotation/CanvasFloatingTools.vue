<template>
  <div
    v-if="!readonly && interactionMode === 'draw' && (mode === 'mask' || mode === 'sam')"
    ref="toolbar"
    class="da-canvas-toolstrip da-mask-toolstrip"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <button
      type="button"
      class="da-toolstrip-grip"
      :title="mode === 'sam' ? '拖动 SAM 工具栏' : '拖动 Mask 工具栏'"
      :aria-label="mode === 'sam' ? '拖动 SAM 工具栏' : '拖动 Mask 工具栏'"
      @pointerdown.stop.prevent="startDrag"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <circle
          v-for="point in gripPoints"
          :key="point.join(',')"
          :cx="point[0]"
          :cy="point[1]"
          r="1"
        />
      </svg>
    </button>

    <button
      v-for="tool in MASK_TOOLS"
      v-show="mode === 'mask'"
      :key="tool.value"
      type="button"
      class="da-mask-tool-button"
      :class="{ active: maskTool === tool.value }"
      :disabled="maskToolDisabled(tool.value)"
      :title="`${tool.label} (${shortcutFor(maskShortcutAction(tool.value))})`"
      :aria-label="tool.label"
      @click="$emit('mask-tool', tool.value)"
    >
      <MaskToolIcon :type="tool.value" />
    </button>

    <label
      v-if="mode === 'mask' && (maskTool === 'brush' || maskTool === 'eraser')"
      class="da-brush-size"
    >
      <span>{{ maskBrushSize }} px</span>
      <input
        :value="maskBrushSize"
        type="range"
        min="2"
        max="120"
        step="2"
        @input="updateBrushSize"
      />
    </label>
    <span v-if="mode === 'mask' && maskPolygonActive" class="da-toolstrip-hint"
      >点击首点闭合多边形</span
    >
    <span v-else-if="mode === 'mask' && maskMergePending" class="da-toolstrip-hint"
      >再点击一个 Mask 完成融合</span
    >
    <span v-else-if="mode === 'mask' && maskTargetActive" class="da-toolstrip-hint"
      >已选定 Mask，Ctrl + 点击可取消</span
    >
    <span v-else-if="mode === 'mask'" class="da-toolstrip-hint">Ctrl + 点击选择已有 Mask</span>

    <template v-if="mode === 'sam'">
      <span class="da-toolstrip-hint">{{ samStatus }}</span>
      <select
        :value="samOutput"
        class="da-sam-output"
        aria-label="SAM 输出类型"
        @change="updateSamOutput"
      >
        <option value="bitmap">位图</option>
        <option value="polygon">矢量</option>
      </select>
      <button
        type="button"
        :disabled="samPromptCount === 0 || samBusy"
        title="撤销提示点"
        @click="$emit('undo-sam')"
      >
        ↶
      </button>
      <button
        type="button"
        :disabled="samPromptCount === 0 || samBusy"
        title="清空 SAM 提示"
        @click="$emit('clear-sam')"
      >
        ×
      </button>
      <button
        type="button"
        :disabled="!samBitmapActive || samBusy"
        title="确认 SAM 结果"
        @click="$emit('commit-sam')"
      >
        ✓
      </button>
    </template>
  </div>

  <div
    v-else-if="!readonly && interactionMode === 'draw' && mode === 'joint'"
    ref="toolbar"
    class="da-canvas-toolstrip"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
  >
    <button
      type="button"
      class="da-toolstrip-grip"
      title="拖动关节工具栏"
      aria-label="拖动关节工具栏"
      @pointerdown.stop.prevent="startDrag"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <circle
          v-for="point in gripPoints"
          :key="point.join(',')"
          :cx="point[0]"
          :cy="point[1]"
          r="1"
        />
      </svg>
    </button>
    <span class="da-toolstrip-hint">
      {{
        jointProgress
          ? `${jointProgress.index + 1}/${jointProgress.total} ${jointProgress.name}`
          : '1/17 鼻子'
      }}
    </span>
    <span class="da-toolstrip-hint">点击可见点，Shift + 点击遮挡点</span>
    <button
      type="button"
      title="当前关键点缺失，跳到下一点"
      aria-label="跳过当前关键点"
      @click="$emit('skip-joint')"
    >
      ↷
    </button>
  </div>

  <div
    v-else-if="
      !readonly &&
      interactionMode === 'select' &&
      (selectedShapeType === 'polyline' ||
        selectedShapeType === 'polygon' ||
        selectedShapeType === 'rect')
    "
    class="da-canvas-toolstrip"
  >
    <button
      v-for="tool in visibleAuxiliaryTools"
      :key="tool.value"
      type="button"
      class="da-aux-tool-button"
      :class="{ active: auxiliaryTool === tool.value }"
      :title="auxiliaryToolTitle(tool)"
      :aria-label="tool.label"
      @click="$emit('auxiliary-tool', tool.value)"
    >
      <AuxiliaryToolIcon :type="tool.value" />
    </button>
    <span v-if="clipPending" class="da-toolstrip-hint">可添加中途点，再点边或顶点完成</span>
    <span v-else-if="reshapePending" class="da-toolstrip-hint"
      >直接点边或顶点完成；空白处可添加任意中途点</span
    >
    <span v-else-if="mergePending" class="da-toolstrip-hint"
      >再选一个多边形（结果沿用首选分组）</span
    >
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AuxiliaryTool, InteractionMode, MaskTool, Shape } from '../../engine/model/types'
import AuxiliaryToolIcon from '../AuxiliaryToolIcon.vue'
import MaskToolIcon from '../MaskToolIcon.vue'
import { AUXILIARY_TOOLS, MASK_TOOLS } from './tool-config'
import { auxiliaryShortcutAction, maskShortcutAction } from './tool-shortcuts'

const props = defineProps<{
  readonly: boolean
  interactionMode: InteractionMode
  mode: string
  maskTool: MaskTool
  maskBrushSize: number
  maskTargetActive: boolean
  maskPolygonActive: boolean
  maskMergePending: boolean
  samStatus: string
  samOutput: 'bitmap' | 'polygon'
  samPromptCount: number
  samBusy: boolean
  samBitmapActive: boolean
  jointProgress: { index: number; total: number; name: string; placed: number } | null
  selectedShapeType: Shape['type'] | null
  auxiliaryTool: AuxiliaryTool
  clipPending: boolean
  reshapePending: boolean
  mergePending: boolean
  shortcutFor: (action: string) => string
}>()

const emit = defineEmits<{
  'mask-tool': [tool: MaskTool]
  'brush-size': [size: number]
  'sam-output': [output: 'bitmap' | 'polygon']
  'undo-sam': []
  'clear-sam': []
  'commit-sam': []
  'skip-joint': []
  'auxiliary-tool': [tool: AuxiliaryTool]
}>()

const toolbar = ref<HTMLElement | null>(null)
const position = ref({ x: 142, y: 10 })
const gripPoints = [
  [5, 4],
  [11, 4],
  [5, 8],
  [11, 8],
  [5, 12],
  [11, 12]
] as const
const visibleAuxiliaryTools = computed(() =>
  AUXILIARY_TOOLS.filter(
    (tool) =>
      tool.value !== 'merge-polygons' ||
      props.selectedShapeType === 'polygon' ||
      props.selectedShapeType === 'rect'
  )
)

let stageObserver: ResizeObserver | null = null
let drag: {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  maxX: number
  maxY: number
} | null = null

function maskToolDisabled(tool: MaskTool): boolean {
  return (tool === 'eraser' || tool === 'inverse-polygon') && !props.maskTargetActive
}

function updateBrushSize(event: Event): void {
  emit('brush-size', Number((event.target as HTMLInputElement).value))
}

function updateSamOutput(event: Event): void {
  emit('sam-output', (event.target as HTMLSelectElement).value as 'bitmap' | 'polygon')
}

function auxiliaryToolTitle(tool: { value: AuxiliaryTool; label: string }): string {
  const action = auxiliaryShortcutAction(tool.value)
  return action ? `${tool.label} (${props.shortcutFor(action)})` : tool.label
}

function constrain(): void {
  const element = toolbar.value
  const stage = element?.parentElement
  if (!element || !stage) return
  position.value = {
    x: Math.max(0, Math.min(stage.clientWidth - element.offsetWidth, position.value.x)),
    y: Math.max(0, Math.min(stage.clientHeight - element.offsetHeight, position.value.y))
  }
  if (!stageObserver) {
    stageObserver = new ResizeObserver(constrain)
    stageObserver.observe(stage)
  }
}

function moveDrag(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return
  position.value = {
    x: Math.max(0, Math.min(drag.maxX, drag.originX + event.clientX - drag.startX)),
    y: Math.max(0, Math.min(drag.maxY, drag.originY + event.clientY - drag.startY))
  }
}

function stopDrag(event?: PointerEvent): void {
  if (event && drag && event.pointerId !== drag.pointerId) return
  drag = null
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function startDrag(event: PointerEvent): void {
  const element = toolbar.value
  const stage = element?.parentElement
  if (!element || !stage || event.button !== 0) return
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: position.value.x,
    originY: position.value.y,
    maxX: Math.max(0, stage.clientWidth - element.offsetWidth),
    maxY: Math.max(0, stage.clientHeight - element.offsetHeight)
  }
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

async function syncToolbarBounds(): Promise<void> {
  await nextTick()
  constrain()
}

watch(() => [props.mode, props.interactionMode, props.readonly], syncToolbarBounds)
onMounted(syncToolbarBounds)
onBeforeUnmount(() => {
  stopDrag()
  stageObserver?.disconnect()
})
</script>
