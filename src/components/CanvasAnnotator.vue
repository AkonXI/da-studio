<template>
  <div class="da-annotator w-full h-full min-h-[420px] font-sans bg-[var(--da-annotator-bg)]">
    <div class="da-workbench overflow-hidden border rounded-xl border-[var(--da-annotator-border)]">
      <div class="da-workbench-body flex gap-0 items-stretch overflow-hidden">
        <CanvasMainToolbar
          :readonly="props.readonly"
          :interaction-mode="currentInteractionMode"
          :mode="mode"
          :modes="toolbarModes"
          :groups="groups"
          :group="group"
          :can-complete="canComplete"
          :has-selected="hasSelected"
          :continuous-active="
            polygonActive || polylineActive || curveActive || jointActive || cuboidActive
          "
          :shortcut-for="shortcutLabel"
          @interaction="setInteractionMode"
          @mode="setMode"
          @group="setGroup"
          @complete="completeCurrent"
          @cancel="cancelCurrent"
          @delete="deleteSelected"
          @clear="clearAll"
        />

        <!-- Canvas -->
        <div
          ref="canvasStage"
          class="da-canvas-stage min-w-0 flex-1 h-full relative overflow-hidden bg-[var(--da-annotator-canvas-bg)]"
        >
          <canvas ref="bgCanvas" class="absolute inset-0 z-10 w-full h-full" />
          <canvas
            ref="shapeCanvas"
            class="absolute inset-0 z-20 w-full h-full cursor-crosshair"
            @mousedown.capture="handleSamPointer"
            @mousemove="updatePointerPosition"
            @mouseleave="pointerPosition = null"
          />
          <canvas
            v-show="mode === 'sam' && currentInteractionMode === 'draw'"
            ref="samPreviewCanvas"
            class="absolute inset-0 z-[25] w-full h-full pointer-events-none"
          />
          <CanvasFloatingTools
            :readonly="props.readonly"
            :interaction-mode="currentInteractionMode"
            :mode="mode"
            :mask-tool="maskTool"
            :mask-brush-size="maskBrushSize"
            :mask-target-active="maskTargetActive"
            :mask-polygon-active="maskPolygonActive"
            :mask-merge-pending="maskMergePending"
            :sam-status="samStatus"
            :sam-output="samOutput"
            :sam-prompt-count="samPrompts.length"
            :sam-busy="samBusy"
            :sam-bitmap-active="Boolean(samBitmap)"
            :joint-progress="jointProgress"
            :selected-shape-type="selectedShapeType"
            :auxiliary-tool="auxiliaryTool"
            :clip-pending="clipPending"
            :reshape-pending="reshapePending"
            :merge-pending="mergePending"
            :shortcut-for="shortcutLabel"
            @mask-tool="setMaskTool"
            @brush-size="updateMaskBrushSize"
            @sam-output="samOutput = $event"
            @undo-sam="undoSamPrompt"
            @clear-sam="clearSam"
            @commit-sam="commitSam"
            @skip-joint="skipJointPoint"
            @auxiliary-tool="setAuxiliaryTool"
          />
          <slot name="canvas-overlay" />
        </div>

        <AnnotationListPanel
          :shapes="shapes"
          :groups="groups"
          :modes="SHAPE_MODE_LIST"
          :color-for-group="colorMap"
          @select="selectByIndex"
          @toggle-one="toggleShapeVisibility"
          @toggle-all="setAllVisibility"
          @toggle-filtered="setFilteredVisibility"
          @hover="hoverShape"
        />
      </div>
      <CanvasStatusBar
        :group-label="groupLabel(group)"
        :group-color="colorMap(group)"
        :interaction-mode="currentInteractionMode"
        :pointer-position="pointerPosition"
        :scale="scale"
        :image-adjustments="imageAdjustments"
        :labels-visible="labelsVisible"
        :grid-visible="gridVisible"
        :crosshair-visible="crosshairVisible"
        :rotation="imageRotation"
        :readonly="props.readonly"
        :can-undo="canUndo"
        :can-redo="canRedo"
        :label-shortcut="shortcutFor('toggle-labels')"
        :zoom-out-shortcut="shortcutFor('zoom-out')"
        :zoom-in-shortcut="shortcutFor('zoom-in')"
        :undo-shortcut="shortcutFor('undo')"
        :redo-shortcut="shortcutFor('redo')"
        @reset-adjustments="resetImageAdjustments"
        @update-adjustment="updateImageAdjustment"
        @toggle-labels="toggleLabels"
        @toggle-grid="toggleGrid"
        @toggle-crosshair="toggleCrosshair"
        @rotate="rotateImage"
        @fit-image="fitImage"
        @zoom="zoom"
        @undo="undo"
        @redo="redo"
      />
    </div>
    <Transition name="da-toast">
      <div v-if="visibilityToast" class="da-visibility-toast" role="status" aria-live="polite">
        {{ visibilityToast }}
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import {
  AnnotationController,
  DEFAULT_GROUPS,
  maskBitmapFromPixels,
  maskBitmapToPolygons,
  decodeMaskBitmap,
  type Shape,
  type Group,
  type Meta,
  type ModeType,
  type InteractionMode,
  type MaskTool,
  type AuxiliaryTool,
  type MaskBitmap,
  type ImageAdjustments
} from '../engine'
import AnnotationListPanel from './annotation/AnnotationListPanel.vue'
import CanvasFloatingTools from './annotation/CanvasFloatingTools.vue'
import CanvasMainToolbar from './annotation/CanvasMainToolbar.vue'
import CanvasStatusBar from './annotation/CanvasStatusBar.vue'
import {
  ANNOTATION_MODES as MODE_LIST,
  AUXILIARY_TOOLS,
  MASK_TOOLS
} from './annotation/tool-config'
import {
  auxiliaryShortcutAction,
  groupShortcutAction,
  maskShortcutAction,
  modeShortcutAction
} from './annotation/tool-shortcuts'
import {
  defaultShortcutBindings,
  isTypingTarget,
  matchesShortcut,
  type AnnotationShortcutAction,
  type ShortcutBindings
} from '../shortcuts'
import { LocalSamClient, isSamWorkerDisposedError, type SamPrompt } from '../sam/client'

interface Props {
  imageSrc?: string
  initialMode?: string
  interactionMode?: InteractionMode
  readonly?: boolean
  modelValue?: Shape[]
  groups?: Group[]
  enabledModes?: ModeType[]
  shortcutBindings?: Partial<ShortcutBindings>
  shortcutsEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  imageSrc: '',
  initialMode: 'rect',
  interactionMode: 'draw',
  readonly: false,
  modelValue: () => [],
  groups: () => DEFAULT_GROUPS,
  enabledModes: () => MODE_LIST.map((item) => item.type),
  shortcutBindings: () => ({}),
  shortcutsEnabled: true
})

interface ChangeEmits {
  (e: 'change', shapes: Shape[], meta: Meta): void
  (e: 'update:modelValue', shapes: Shape[]): void
  (e: 'error', error: Error): void
  (e: 'load'): void
}

const emit = defineEmits<ChangeEmits>()

const defaultBindings = defaultShortcutBindings()
const SHAPE_MODE_LIST = MODE_LIST.filter((item) => item.type !== 'sam')

function shortcutFor(action: AnnotationShortcutAction): string {
  return props.shortcutBindings[action] || defaultBindings[action]
}

function shortcutLabel(action: string): string {
  return shortcutFor(action as AnnotationShortcutAction)
}

const enabledSet = computed(() => new Set(props.enabledModes))
const toolbarModes = computed(() =>
  MODE_LIST.map((item) => ({ ...item, enabled: enabledSet.value.has(item.type) }))
)
function isModeEnabled(t: ModeType) {
  return enabledSet.value.has(t)
}

const resolvedMode = ref(
  enabledSet.value.has(props.initialMode as ModeType)
    ? props.initialMode
    : props.enabledModes[0] || 'rect'
)

const bgCanvas = ref<HTMLCanvasElement | null>(null)
const shapeCanvas = ref<HTMLCanvasElement | null>(null)
const samPreviewCanvas = ref<HTMLCanvasElement | null>(null)
const canvasStage = ref<HTMLElement | null>(null)

const shapes = ref<Shape[]>([])
const mode = ref(resolvedMode.value)
const currentInteractionMode = ref<InteractionMode>(props.interactionMode)
const group = ref('red')
const scale = ref(1)
const polygonActive = ref(false)
const polylineActive = ref(false)
const curveActive = ref(false)
const jointActive = ref(false)
const jointProgress = ref<{ index: number; total: number; name: string; placed: number } | null>(
  null
)
const cuboidActive = ref(false)
const maskTool = ref<MaskTool>('brush')
const maskBrushSize = ref(24)
const maskTargetActive = ref(false)
const maskPolygonActive = ref(false)
const maskMergePending = ref(false)
const auxiliaryTool = ref<AuxiliaryTool>('move')
const selectedShapeType = ref<Shape['type'] | null>(null)
const clipPending = ref(false)
const mergePending = ref(false)
const reshapePending = ref(false)
const imageAdjustments = ref<ImageAdjustments>({
  brightness: 100,
  contrast: 100,
  saturation: 100
})
const pointerPosition = ref<{ x: number; y: number } | null>(null)
const canComplete = ref(false)
const hasSelected = ref(false)
const canUndo = ref(false)
const canRedo = ref(false)
const visibilityToast = ref('')
const labelsVisible = ref(true)
const gridVisible = ref(true)
const crosshairVisible = ref(true)
const imageRotation = ref(0)
const samPrompts = ref<SamPrompt[]>([])
const samBitmap = ref<MaskBitmap | null>(null)
const samOutput = ref<'bitmap' | 'polygon'>('bitmap')
const samBusy = ref(false)
const samStatus = ref('点击前景，Shift + 点击背景')

let engine: AnnotationController | null = null
let canvasResizeObserver: ResizeObserver | null = null
let visibilityToastTimer: ReturnType<typeof setTimeout> | null = null
let samLoadPromise: Promise<void> | null = null
let samLoadedImageVersion = -1
let samLoadingImageVersion = -1
let samGeneration = 0
let imageLoadVersion = 0
let componentDisposed = false
let samBitmapRenderCache: {
  bitmap: MaskBitmap
  color: string
  canvas: HTMLCanvasElement
} | null = null
const samClient = new LocalSamClient()
samClient.onProgress = (progress) => {
  if (componentDisposed) return
  samStatus.value = progress === null ? '正在加载本地 SAM…' : `下载模型 ${Math.round(progress)}%`
}

function refreshEngine(): void {
  if (!engine) return
  shapes.value = engine.getShapes()
  const meta = engine.getMeta()
  scale.value = meta.scale
  mode.value = engine.mode
  currentInteractionMode.value = engine.interactionMode
  polygonActive.value = engine.isPolygonActive()
  polylineActive.value = engine.isPolylineActive()
  curveActive.value = engine.isCurveActive()
  jointActive.value = engine.isJointActive()
  jointProgress.value = engine.getActiveJointProgress()
  cuboidActive.value = engine.isCuboidActive()
  maskTool.value = engine.maskTool
  maskBrushSize.value = engine.maskBrushSize
  maskTargetActive.value = engine.hasActiveMaskTarget()
  maskPolygonActive.value = engine.isMaskPolygonActive()
  maskMergePending.value = engine.isMaskMergePending()
  auxiliaryTool.value = engine.auxiliaryTool
  clipPending.value = engine.isPathClipPending()
  mergePending.value = engine.isPolygonMergePending()
  reshapePending.value = engine.isPathReshapePending()
  imageAdjustments.value = { ...engine.imageAdjustments }
  labelsVisible.value = engine.areLabelsVisible()
  gridVisible.value = engine.isGridVisible()
  crosshairVisible.value = engine.isCrosshairVisible()
  imageRotation.value = engine.getImageRotation()
  const last = engine.getLastShape()
  canComplete.value = !!(
    last &&
    ((polygonActive.value && 'points' in last && last.points.length >= 3) ||
      (polylineActive.value && 'points' in last && last.points.length >= 2) ||
      (curveActive.value && 'points' in last && last.points.length >= 2) ||
      (jointActive.value && Boolean(jointProgress.value?.placed)) ||
      (cuboidActive.value && 'points' in last && last.points.length >= 2))
  )
  const selected = engine.getSelectedShape()
  selectedShapeType.value = selected?.type ?? null
  group.value = selected ? selected.group : engine.currentGroup
  hasSelected.value = selected !== null
  canUndo.value = engine.canUndo()
  canRedo.value = engine.canRedo()
  emit('change', shapes.value, meta)
  emit('update:modelValue', shapes.value)
  drawSamPreview()
}

function drawSamPreview(): void {
  const canvas = samPreviewCanvas.value
  if (!canvas || !engine) return
  const controller = engine
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  const bitmap = samBitmap.value
  if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
    const color = colorMap(group.value).replace('#', '')
    if (
      !samBitmapRenderCache ||
      samBitmapRenderCache.bitmap !== bitmap ||
      samBitmapRenderCache.color !== color
    ) {
      const source = document.createElement('canvas')
      source.width = bitmap.width
      source.height = bitmap.height
      const sourceContext = source.getContext('2d')!
      const data = sourceContext.createImageData(bitmap.width, bitmap.height)
      const pixels = decodeMaskBitmap(bitmap)
      const rgb = [0, 1, 2].map((index) => parseInt(color.slice(index * 2, index * 2 + 2), 16))
      for (let index = 0; index < pixels.length; index++) {
        if (!pixels[index]) continue
        data.data[index * 4] = rgb[0]
        data.data[index * 4 + 1] = rgb[1]
        data.data[index * 4 + 2] = rgb[2]
        data.data[index * 4 + 3] = 120
      }
      sourceContext.putImageData(data, 0, 0)
      samBitmapRenderCache = { bitmap, color, canvas: source }
    }
    context.save()
    context.imageSmoothingEnabled = false
    context.setTransform(...controller.getCanvasTransform())
    context.drawImage(samBitmapRenderCache.canvas, bitmap.x, bitmap.y)
    context.restore()
  }
  samPrompts.value.forEach((prompt) => {
    const { x, y } = controller.toCanvasPoint(prompt.x, prompt.y)
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fillStyle = prompt.label === 1 ? '#22c55e' : '#ef4444'
    context.fill()
    context.strokeStyle = '#fff'
    context.lineWidth = 2
    context.stroke()
  })
}

async function prepareSam(): Promise<void> {
  const imageVersion = imageLoadVersion
  if (samLoadedImageVersion === imageVersion) {
    samBusy.value = false
    samStatus.value = '点击前景，Shift + 点击背景'
    return
  }
  if (samLoadPromise && samLoadingImageVersion === imageVersion) return samLoadPromise
  const image = engine?.getImageDataUrl()
  if (!image) throw new Error('图片尚未加载完成')
  samLoadingImageVersion = imageVersion
  samBusy.value = true
  samStatus.value = '正在加载本地 SAM…'
  const loadPromise = samClient
    .load(image)
    .then(() => {
      if (!componentDisposed && imageVersion === imageLoadVersion) {
        samLoadedImageVersion = imageVersion
        samStatus.value = '点击前景，Shift + 点击背景'
      }
    })
    .catch((error) => {
      if (
        !componentDisposed &&
        imageVersion === imageLoadVersion &&
        !isSamWorkerDisposedError(error)
      ) {
        samStatus.value = `SAM 加载失败：${error instanceof Error ? error.message : String(error)}`
      }
      throw error
    })
    .finally(() => {
      if (samLoadPromise === loadPromise) {
        samLoadPromise = null
        samLoadingImageVersion = -1
      }
      if (!componentDisposed && imageVersion === imageLoadVersion) samBusy.value = false
    })
  samLoadPromise = loadPromise
  return loadPromise
}

async function decodeSam(): Promise<void> {
  if (samPrompts.value.length === 0) {
    samBitmap.value = null
    drawSamPreview()
    return
  }
  const generation = samGeneration
  samBusy.value = true
  try {
    await prepareSam()
    const result = await samClient.decode(samPrompts.value)
    if (componentDisposed || generation !== samGeneration) return
    samBitmap.value = maskBitmapFromPixels(result.pixels, result.width, result.height)
    samStatus.value = `预览 ${(result.score * 100).toFixed(1)}%`
    drawSamPreview()
  } catch (error) {
    if (!componentDisposed && generation === samGeneration && !isSamWorkerDisposedError(error)) {
      samStatus.value = `SAM 失败：${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    if (!componentDisposed && generation === samGeneration) samBusy.value = false
  }
}

function handleSamPointer(event: MouseEvent): void {
  if (currentInteractionMode.value !== 'draw' || mode.value !== 'sam' || event.button !== 0) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (samBusy.value || !engine) return
  const point = engine.toImagePoint(event.offsetX, event.offsetY)
  samPrompts.value.push({ x: point.x, y: point.y, label: event.shiftKey ? 0 : 1 })
  drawSamPreview()
  void decodeSam()
}

function undoSamPrompt(): void {
  samPrompts.value.pop()
  void decodeSam()
}

function clearSam(): void {
  samGeneration++
  samPrompts.value = []
  samBitmap.value = null
  samBitmapRenderCache = null
  samStatus.value = '点击前景，Shift + 点击背景'
  drawSamPreview()
}

function commitSam(): void {
  if (!engine || !samBitmap.value) return
  if (samOutput.value === 'polygon') {
    const contours = maskBitmapToPolygons(samBitmap.value)
    if (contours.length === 0) {
      showVisibilityToast('SAM 结果没有可用外轮廓')
      return
    }
    engine.addPolygonContours(contours)
  } else {
    engine.addMaskBitmap(samBitmap.value)
  }
  clearSam()
  refreshEngine()
  showVisibilityToast(
    samOutput.value === 'polygon' ? 'SAM 已保存为矢量多边形' : 'SAM 已保存为位图 Mask'
  )
}

function colorMap(g: string): string {
  return engine?.getGroup(g)?.stroke || props.groups[0]?.stroke || '#e53935'
}

function groupLabel(g: string): string {
  return engine?.getGroup(g)?.label || g
}

function updateImageAdjustments(): void {
  engine?.setImageAdjustments(imageAdjustments.value)
}

function updateImageAdjustment(key: keyof ImageAdjustments, value: number): void {
  imageAdjustments.value = { ...imageAdjustments.value, [key]: value }
  updateImageAdjustments()
}

function resetImageAdjustments(): void {
  imageAdjustments.value = { brightness: 100, contrast: 100, saturation: 100 }
  updateImageAdjustments()
}

function fitImage(): void {
  engine?.fitImageToCanvas()
  refreshEngine()
}

function zoom(delta: number): void {
  engine?.zoom(delta)
  refreshEngine()
}

function toggleLabels(): void {
  if (!engine) return
  engine.setLabelsVisible(!engine.areLabelsVisible())
  refreshEngine()
}

function toggleGrid(): void {
  if (!engine) return
  engine.setGridVisible(!engine.isGridVisible())
  refreshEngine()
}

function toggleCrosshair(): void {
  if (!engine) return
  engine.setCrosshairVisible(!engine.isCrosshairVisible())
  refreshEngine()
}

function rotateImage(step: number): void {
  if (!engine) return
  engine.rotateImage(step)
  refreshEngine()
  drawSamPreview()
}

function showVisibilityToast(message: string): void {
  visibilityToast.value = message
  if (visibilityToastTimer !== null) clearTimeout(visibilityToastTimer)
  visibilityToastTimer = setTimeout(() => {
    visibilityToast.value = ''
    visibilityToastTimer = null
  }, 1800)
}

function toggleShapeVisibility(index: number): void {
  const hidden = !shapes.value[index]?.hidden
  engine?.toggleShapeVisibility(index)
  refreshEngine()
  showVisibilityToast(hidden ? `已隐藏标注 ${index + 1}` : `已显示标注 ${index + 1}`)
}

function setAllVisibility(hidden: boolean): void {
  engine?.setAllShapesVisibility(hidden)
  refreshEngine()
  showVisibilityToast(hidden ? `已隐藏全部 ${shapes.value.length} 个标注` : '已显示全部标注')
}

function setFilteredVisibility(indices: number[], hidden: boolean): void {
  const count = indices.length
  if (count === 0) return
  engine?.setShapesVisibility(indices, hidden)
  refreshEngine()
  showVisibilityToast(`${hidden ? '已隐藏' : '已显示'}当前筛选的 ${count} 个标注`)
}

function resizeCanvasToStage(): void {
  const stage = canvasStage.value
  if (!stage) return
  const width = Math.max(1, Math.floor(stage.clientWidth))
  const height = Math.max(1, Math.floor(stage.clientHeight))
  if (samPreviewCanvas.value) {
    samPreviewCanvas.value.width = width
    samPreviewCanvas.value.height = height
  }
  if (engine) {
    engine.resizeCanvas(width, height)
  } else {
    if (bgCanvas.value) {
      bgCanvas.value.width = width
      bgCanvas.value.height = height
    }
    if (shapeCanvas.value) {
      shapeCanvas.value.width = width
      shapeCanvas.value.height = height
    }
  }
  drawSamPreview()
}

function setMaskTool(tool: MaskTool): void {
  if (!engine) return
  engine.setMaskTool(tool)
  refreshEngine()
}

function maskToolDisabled(tool: MaskTool): boolean {
  return (tool === 'eraser' || tool === 'inverse-polygon') && !maskTargetActive.value
}

function updateMaskBrushSize(size: number): void {
  maskBrushSize.value = size
  engine?.setMaskBrushSize(size)
  refreshEngine()
}

function setAuxiliaryTool(tool: AuxiliaryTool): void {
  engine?.setAuxiliaryTool(tool)
  refreshEngine()
}

function updatePointerPosition(event: MouseEvent): void {
  pointerPosition.value = engine?.toImagePoint(event.offsetX, event.offsetY) ?? null
}

function setInteractionMode(m: InteractionMode): void {
  if (!engine) return
  if (m === 'select' && mode.value === 'sam') clearSam()
  engine.setInteractionMode(m)
  currentInteractionMode.value = m
  refreshEngine()
}

function setMode(m: ModeType): void {
  if (!engine) return
  if (mode.value === 'sam' && m !== 'sam') clearSam()
  engine.setMode(m)
  mode.value = m
  refreshEngine()
  if (m === 'sam') void prepareSam().catch(() => undefined)
}

function setGroup(g: string): void {
  if (!engine) return
  if (engine.getSelectedShape()) {
    engine.setSelectedShapeGroup(g)
  } else {
    engine.setGroup(g)
  }
  refreshEngine()
}

function undo(): void {
  if (!engine) return
  engine.undo()
  refreshEngine()
}

function redo(): void {
  if (!engine) return
  engine.redo()
  refreshEngine()
}

function deleteSelected(): void {
  if (!engine) return
  engine.deleteSelected()
  refreshEngine()
}

function selectByIndex(i: number): void {
  if (!engine) return
  if (currentInteractionMode.value === 'draw') {
    setInteractionMode('select')
  }
  engine.selectShapeByIndex(i)
  engine.focusOnShape(i)
  refreshEngine()
}

function hoverShape(index: number | null): void {
  engine?.setHoveredShape(index)
}

function clearAll(): void {
  if (!engine) return
  engine.clear()
  refreshEngine()
}

function completeCurrent(): void {
  if (!engine) return
  if (polygonActive.value) engine.completePolygon()
  else if (polylineActive.value) engine.completePolyline()
  else if (curveActive.value) engine.completeCurve()
  else if (jointActive.value) engine.completeJoint()
  else if (cuboidActive.value) engine.completeCuboid()
  refreshEngine()
}

function skipJointPoint(): void {
  engine?.skipJointPoint()
  refreshEngine()
}

function cancelCurrent(): void {
  engine?.cancelCurrentDrawing()
  refreshEngine()
}

function handleKeydown(e: KeyboardEvent): void {
  if (!props.shortcutsEnabled || isTypingTarget(e.target)) return
  if (e.key === 'Control' && !props.readonly) {
    engine?.setTemporarySelect(true)
    refreshEngine()
    return
  }

  const run = (action: AnnotationShortcutAction, callback: () => void, disabled = false) => {
    if (disabled || !matchesShortcut(e, shortcutFor(action))) return false
    e.preventDefault()
    callback()
    return true
  }

  if (run('undo', undo, props.readonly || !canUndo.value)) return
  if (run('redo', redo, props.readonly || !canRedo.value)) return
  if (
    run(
      'cancel-shape',
      cancelCurrent,
      props.readonly ||
        !(polygonActive.value || polylineActive.value || curveActive.value || jointActive.value)
    )
  )
    return
  if (run('complete-shape', completeCurrent, props.readonly || !canComplete.value)) return
  if (run('delete-selected', deleteSelected, props.readonly || !hasSelected.value)) return
  if (run('clear-all', clearAll, props.readonly || shapes.value.length === 0)) return
  if (run('toggle-labels', toggleLabels)) return
  if (
    run(
      'toggle-interaction',
      () => setInteractionMode(currentInteractionMode.value === 'select' ? 'draw' : 'select'),
      props.readonly
    )
  )
    return
  if (
    run('zoom-in', () => {
      engine?.zoom(0.1)
      refreshEngine()
    })
  )
    return
  if (
    run('zoom-out', () => {
      engine?.zoom(-0.1)
      refreshEngine()
    })
  )
    return
  if (run('fit-image', fitImage)) return
  if (
    run('pan-up', () => {
      engine?.pan(0, -20)
      refreshEngine()
    })
  )
    return
  if (
    run('pan-down', () => {
      engine?.pan(0, 20)
      refreshEngine()
    })
  )
    return
  if (
    run('pan-left', () => {
      engine?.pan(20, 0)
      refreshEngine()
    })
  )
    return
  if (
    run('pan-right', () => {
      engine?.pan(-20, 0)
      refreshEngine()
    })
  )
    return

  for (const item of MODE_LIST) {
    if (
      run(
        modeShortcutAction(item.type),
        () => setMode(item.type),
        props.readonly || !isModeEnabled(item.type)
      )
    )
      return
  }
  for (let index = 0; index < Math.min(props.groups.length, 4); index++) {
    if (run(groupShortcutAction(index), () => setGroup(props.groups[index].name), props.readonly))
      return
  }
  for (const item of AUXILIARY_TOOLS) {
    const action = auxiliaryShortcutAction(item.value)
    if (action && run(action, () => setAuxiliaryTool(item.value), props.readonly)) return
  }
  for (const item of MASK_TOOLS) {
    if (
      run(
        maskShortcutAction(item.value),
        () => setMaskTool(item.value),
        props.readonly || mode.value !== 'mask' || maskToolDisabled(item.value)
      )
    )
      return
  }
}

function handleKeyup(e: KeyboardEvent): void {
  if (e.key !== 'Control') return
  engine?.setTemporarySelect(false)
  refreshEngine()
}

function releaseTemporarySelect(): void {
  engine?.setTemporarySelect(false)
  refreshEngine()
}

watch(
  () => props.readonly,
  (v) => {
    if (engine) engine.setReadonly(v)
  }
)

watch(
  () => props.modelValue,
  (shapes) => {
    if (engine) {
      engine.setShapes(shapes)
      refreshEngine()
    }
  },
  { deep: true }
)

onMounted(() => {
  engine = new AnnotationController({
    mode: resolvedMode.value,
    interactionMode: props.interactionMode,
    readonly: props.readonly,
    onChange: refreshEngine,
    onViewportChange: drawSamPreview,
    groups: props.groups
  })
  resizeCanvasToStage()
  canvasResizeObserver = new ResizeObserver(resizeCanvasToStage)
  if (canvasStage.value) canvasResizeObserver.observe(canvasStage.value)

  const mountedEngine = engine
  mountedEngine
    .mount(bgCanvas.value!, shapeCanvas.value!, props.imageSrc)
    .then(() => {
      if (componentDisposed || engine !== mountedEngine) return
      resizeCanvasToStage()
      refreshEngine()
      emit('load')
    })
    .catch((err) => {
      if (!componentDisposed) emit('error', err as Error)
    })

  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('keyup', handleKeyup)
  window.addEventListener('blur', releaseTemporarySelect)
})

watch(
  () => props.imageSrc,
  async (src) => {
    const currentEngine = engine
    if (!src || !currentEngine) return
    const loadVersion = ++imageLoadVersion
    clearSam()
    samLoadPromise = null
    samLoadedImageVersion = -1
    samLoadingImageVersion = -1
    samBusy.value = false

    const currentMeta = currentEngine.getMeta()
    currentEngine.loadAnnotationState(
      [],
      {
        ...currentMeta,
        scale: 1,
        translateX: 0,
        translateY: 0,
        imageAdjustments: { brightness: 100, contrast: 100, saturation: 100 },
        rotation: 0
      },
      { preserveToolState: true }
    )
    refreshEngine()

    void samClient.reset().catch((error) => {
      if (!componentDisposed && !isSamWorkerDisposedError(error)) emit('error', error)
    })

    try {
      await currentEngine.loadImage(src)
      if (componentDisposed || loadVersion !== imageLoadVersion || engine !== currentEngine) return
      resizeCanvasToStage()
      refreshEngine()
      emit('load')
    } catch (error) {
      if (!componentDisposed && loadVersion === imageLoadVersion) {
        emit('error', error instanceof Error ? error : new Error(String(error)))
      }
    }
  }
)

onUnmounted(() => {
  componentDisposed = true
  imageLoadVersion++
  samGeneration++
  if (visibilityToastTimer !== null) clearTimeout(visibilityToastTimer)
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = null
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('blur', releaseTemporarySelect)
  if (engine) engine.destroy()
  samClient.destroy()
  engine = null
})

defineExpose({
  getShapes: (): Shape[] => engine?.getShapes() || [],
  getMeta: (): Meta =>
    engine?.getMeta() || {
      scale: 1,
      translateX: 0,
      translateY: 0,
      mode: '',
      group: ''
    },
  completeCurrent,
  loadShapes: (loadedShapes: Shape[], meta: Meta) => {
    engine?.loadShapes(loadedShapes, meta)
    refreshEngine()
  },
  loadAnnotationState: (
    loadedShapes: Shape[],
    meta: Meta,
    options?: { preserveToolState?: boolean }
  ) => {
    engine?.loadAnnotationState(loadedShapes, meta, options)
    refreshEngine()
  },
  getShortcutState: () => ({
    canUndo: canUndo.value,
    canRedo: canRedo.value,
    hasSelected: hasSelected.value,
    canComplete: canComplete.value,
    canClear: shapes.value.length > 0
  }),
  engine: (): AnnotationController | null => engine
})
</script>

<style src="./CanvasAnnotator.css"></style>
