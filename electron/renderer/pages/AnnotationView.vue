<template>
  <div class="precision-annotation-view">
    <header class="precision-annotation-header">
      <div class="flex items-center gap-3">
        <UiButton class="da-back-button" variant="ghost" size="sm" @click="backToDetail">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          数据集详情
        </UiButton>
        <span style="color: var(--text-tertiary); font-size: 12px">|</span>
        <span class="text-xs" style="color: var(--text-secondary)">{{
          allImages.length > 0 ? `图片 ${currentIdx + 1} / ${allImages.length}` : ''
        }}</span>
      </div>
      <div v-if="currentImage" class="flex items-center gap-2">
        <UiButton
          size="icon"
          variant="ghost"
          :title="`快捷键管理 (${shortcutBindings['open-shortcuts']})`"
          aria-label="快捷键管理"
          @click="shortcutDialogOpen = true"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h7M18 14h.01" /></svg>
        </UiButton>
        <UiButton size="sm" variant="outline" @click="showPendingRail = !showPendingRail">{{
          showPendingRail ? '隐藏待标注' : '显示待标注'
        }}</UiButton>
        <UiButton size="sm" variant="outline" :disabled="props.readonly" @click="skipImage">跳过</UiButton>
        <UiButton size="sm" variant="primary" :disabled="props.readonly" @click="completeImage"
          >完成</UiButton
        >
      </div>
    </header>

    <div class="precision-annotation-body">
      <div v-if="showPendingRail && allImages.length > 0" class="precision-image-rail">
        <ImageGrid
          :images="pendingImages"
          :selected-id="currentImage?.id ?? null"
          @select="goToImage"
        />
      </div>
      <div class="precision-annotation-canvas">
        <div
          v-if="currentImage && currentSrc"
          class="w-full h-full flex items-center justify-center p-4"
        >
          <div
            class="precision-annotator-shell rounded-xl overflow-hidden shadow-lg"
            style="background: #fff"
          >
            <CanvasAnnotator
              ref="annotatorRef"
              :image-src="currentSrc"
              :readonly="props.readonly"
              :enabled-modes="datasetTools"
              :groups="datasetGroups"
              :shortcut-bindings="shortcutBindings"
              :shortcuts-enabled="!shortcutDialogOpen"
              @change="onAnnotatorChange"
              @load="restoreCurrentAnnotation"
            />
          </div>
        </div>
        <UiEmpty v-else description="暂无待标注图片" />
      </div>
    </div>
    <UiDialog
      v-if="shortcutDialogOpen"
      :open="true"
      title="快捷键管理"
      description="点击快捷键后按下新的组合键；Ctrl 按住时可临时进入编辑模式"
      size="lg"
      @update:open="(open) => !open && closeShortcutDialog()"
    >
      <div class="shortcut-groups">
        <section v-for="group in groupedShortcuts" :key="group.category" class="shortcut-group">
          <h3>{{ group.category }}</h3>
          <div class="shortcut-list">
            <div v-for="item in group.items" :key="item.action" class="shortcut-row">
              <span>{{ item.label }}</span>
              <div class="shortcut-row-actions">
                <button
                  type="button"
                  class="shortcut-binding"
                  :class="{
                    'is-recording': recordingAction === item.action,
                    'is-conflict': conflictActions.has(item.action)
                  }"
                  @click="recordingAction = item.action"
                >
                  {{ recordingAction === item.action ? '请按键…' : shortcutBindings[item.action] || '未设置' }}
                </button>
                <button
                  type="button"
                  class="shortcut-clear"
                  aria-label="清除快捷键"
                  title="清除快捷键"
                  @click="clearShortcut(item.action)"
                >×</button>
              </div>
            </div>
          </div>
        </section>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="resetShortcuts">恢复默认</UiButton>
        <UiButton variant="primary" @click="closeShortcutDialog">完成</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import CanvasAnnotator from '../../../src/components/CanvasAnnotator.vue'
import ImageGrid from '../components/ImageGrid.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiEmpty from '../components/ui/UiEmpty.vue'
import { useToast } from '../composables/useToast'
import { DEFAULT_GROUPS } from '../../../src/engine/shared/utils'
import type { Shape, Meta, ModeType } from '../../../src/engine'
import {
  ANNOTATION_MODES,
  MAX_ANNOTATION_GROUPS
} from '../../../src/components/annotation/tool-config'
import {
  ANNOTATION_SHORTCUTS,
  defaultShortcutBindings,
  isTypingTarget,
  matchesShortcut,
  shortcutFromEvent,
  type AnnotationShortcutAction,
  type ShortcutBindings
} from '../../../src/shortcuts'

const props = defineProps<{ datasetId: number; startImageId?: number | null; readonly?: boolean }>()
const router = useRouter()
const toast = useToast()

interface ImageItem {
  id: number
  dataset_id: number
  filename: string
  original_name: string
  width: number
  height: number
  created_at: string
  annotated: boolean
  skipped: boolean
}

const allImages = ref<ImageItem[]>([])
const currentIdx = ref(0)
const currentSrc = ref('')
const pendingAnnotation = ref<{ imageId: number; shapes: Shape[]; meta: Meta } | null>(null)
const annotatorRef = ref<InstanceType<typeof CanvasAnnotator> | null>(null)
let annotatorHasLoadedImage = false
const availableToolTypes = new Set<ModeType>(ANNOTATION_MODES.map((tool) => tool.type))
const datasetTools = ref<ModeType[]>(ANNOTATION_MODES.map((tool) => tool.type))
const datasetGroups = ref<any[]>(DEFAULT_GROUPS.map((group) => ({ ...group })))
const showPendingRail = ref(true)
const shortcutDialogOpen = ref(false)
const recordingAction = ref<AnnotationShortcutAction | null>(null)
const shortcutStorageKey = 'da-studio.annotation-shortcuts.v1'
const shortcutBindings = ref<ShortcutBindings>(loadShortcutBindings())

const groupedShortcuts = computed(() => {
  const categories = ['通用', '绘制工具', '辅助工具', 'Mask', '视图', '标注流程'] as const
  return categories.map((category) => ({
    category,
    items: ANNOTATION_SHORTCUTS.filter((item) => item.category === category)
  }))
})
const conflictActions = computed(() => {
  const byBinding = new Map<string, AnnotationShortcutAction[]>()
  for (const item of ANNOTATION_SHORTCUTS) {
    const binding = shortcutBindings.value[item.action]
    if (!binding) continue
    byBinding.set(binding, [...(byBinding.get(binding) ?? []), item.action])
  }
  return new Set([...byBinding.values()].filter((actions) => actions.length > 1).flat())
})

function loadShortcutBindings(): ShortcutBindings {
  const defaults = defaultShortcutBindings()
  try {
    const saved = JSON.parse(localStorage.getItem(shortcutStorageKey) || '{}')
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

function persistShortcuts() {
  localStorage.setItem(shortcutStorageKey, JSON.stringify(shortcutBindings.value))
  window.electronAPI?.setShortcutBindings?.({ ...shortcutBindings.value })
}

function clearShortcut(action: AnnotationShortcutAction) {
  shortcutBindings.value = { ...shortcutBindings.value, [action]: '' }
  recordingAction.value = null
  persistShortcuts()
}

function resetShortcuts() {
  shortcutBindings.value = defaultShortcutBindings()
  recordingAction.value = null
  persistShortcuts()
  toast.success('快捷键已恢复默认')
}

function closeShortcutDialog() {
  recordingAction.value = null
  shortcutDialogOpen.value = false
}

function handlePageKeydown(event: KeyboardEvent) {
  if (recordingAction.value) {
    const binding = shortcutFromEvent(event)
    if (!binding) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const conflict = ANNOTATION_SHORTCUTS.find(
      (item) => item.action !== recordingAction.value && shortcutBindings.value[item.action] === binding
    )
    if (conflict) {
      toast.warning(`快捷键 ${binding} 已用于“${conflict.label}”`)
      return
    }
    shortcutBindings.value = { ...shortcutBindings.value, [recordingAction.value]: binding }
    recordingAction.value = null
    persistShortcuts()
    toast.success(`快捷键已设为 ${binding}`)
    return
  }
  if (shortcutDialogOpen.value || isTypingTarget(event.target)) return
  if (matchesShortcut(event, shortcutBindings.value['open-shortcuts'])) {
    event.preventDefault()
    event.stopImmediatePropagation()
    shortcutDialogOpen.value = true
    return
  }
  if (matchesShortcut(event, shortcutBindings.value['complete-image']) && !props.readonly) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void completeImage()
    return
  }
  if (matchesShortcut(event, shortcutBindings.value['skip-image']) && !props.readonly) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void skipImage()
    return
  }
  if (matchesShortcut(event, shortcutBindings.value['toggle-image-list'])) {
    event.preventDefault()
    event.stopImmediatePropagation()
    showPendingRail.value = !showPendingRail.value
  }
}

const currentImage = computed(() => allImages.value[currentIdx.value] ?? null)
const pendingImages = computed(() => allImages.value.filter((i) => !i.annotated && !i.skipped))

function publishShortcutState() {
  const state = annotatorRef.value?.getShortcutState?.() ?? {
    canUndo: false,
    canRedo: false,
    hasSelected: false,
    canComplete: false,
    canClear: false
  }
  window.electronAPI?.setShortcutState?.({
    page: 'annotate',
    readonly: Boolean(props.readonly || !currentImage.value || !currentSrc.value),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    hasSelected: state.hasSelected,
    canComplete: state.canComplete,
    canClear: state.canClear,
    canZoom: Boolean(currentImage.value && currentSrc.value)
  })
}

function scheduleShortcutStatePublish() {
  nextTick(() => publishShortcutState())
}

function backToDetail() {
  router.push(`/datasets/${props.datasetId}`)
}

async function loadDatasetTools() {
  const list = await window.electronAPI.dataset.list()
  const ds = list.find((d: any) => d.id === props.datasetId)
  if (ds?.tools) {
    const t = JSON.parse(ds.tools)
    datasetTools.value = Array.isArray(t)
      ? t.filter((x: any): x is ModeType => availableToolTypes.has(x))
      : datasetTools.value
  }
  if (ds?.groups) {
    const g = JSON.parse(ds.groups)
    datasetGroups.value = Array.isArray(g)
      ? g.slice(0, MAX_ANNOTATION_GROUPS)
      : datasetGroups.value
  }
}

async function loadImages() {
  allImages.value = await window.electronAPI.image.listWithStatus(props.datasetId)
  if (allImages.value.length === 0) {
    currentIdx.value = 0
    currentSrc.value = ''
    scheduleShortcutStatePublish()
    return
  }
  const targetId = props.startImageId
  const targetIdx = targetId ? allImages.value.findIndex((image) => image.id === targetId) : -1
  if (targetIdx >= 0) {
    currentIdx.value = targetIdx
  } else {
    const nextPending = pendingImages.value[0]
    currentIdx.value = nextPending
      ? allImages.value.findIndex((image) => image.id === nextPending.id)
      : 0
  }
  if (currentImage.value) await loadCurrentImage()
}

async function loadCurrentImage() {
  const img = currentImage.value
  if (!img) {
    currentSrc.value = ''
    scheduleShortcutStatePublish()
    return
  }
  const [resolvedUrl, annotation] = await Promise.all([
    window.electronAPI.image.getUrl?.(img.id),
    window.electronAPI.annotation.get(img.id)
  ])
  if (currentImage.value?.id !== img.id) return
  const url =
    resolvedUrl ??
    `local-file://uploads/${encodeURIComponent(
      (await window.electronAPI.image.getPath(img.id)).split(/[/\\]/).pop() || ''
    )}`
  try {
    pendingAnnotation.value = annotation
      ? {
          imageId: img.id,
          shapes: JSON.parse(annotation.shapes) as Shape[],
          meta: JSON.parse(annotation.meta) as Meta
        }
      : null
  } catch {
    pendingAnnotation.value = null
  }
  currentSrc.value = url
  scheduleShortcutStatePublish()
}

function restoreCurrentAnnotation() {
  const pending = pendingAnnotation.value
  if (pending && pending.imageId === currentImage.value?.id) {
    annotatorRef.value?.loadAnnotationState?.(pending.shapes, pending.meta, {
      preserveToolState: annotatorHasLoadedImage
    })
    pendingAnnotation.value = null
  }
  annotatorHasLoadedImage = true
  publishShortcutState()
}

async function goToImage(id: number) {
  const idx = allImages.value.findIndex((i) => i.id === id)
  if (idx >= 0) {
    currentIdx.value = idx
    await loadCurrentImage()
  }
}

async function completeImage() {
  if (!currentImage.value || !annotatorRef.value) return
  annotatorRef.value.completeCurrent?.()
  publishShortcutState()
  const shapes = annotatorRef.value.getShapes?.() ?? []
  const meta = annotatorRef.value.getMeta?.() ?? {
    scale: 1,
    translateX: 0,
    translateY: 0,
    mode: datasetTools.value[0] ?? 'rect',
    group: datasetGroups.value[0]?.name ?? 'red'
  }
  await window.electronAPI.annotation.save(
    currentImage.value.id,
    JSON.stringify(shapes),
    JSON.stringify(meta)
  )
  updateImageStatus(currentImage.value.id, { annotated: true, skipped: false })
  await advanceToNext()
}

async function skipImage() {
  if (!currentImage.value) return
  await window.electronAPI.annotation.skip(currentImage.value.id)
  updateImageStatus(currentImage.value.id, { annotated: false, skipped: true })
  await advanceToNext()
}

function updateImageStatus(id: number, st: Pick<ImageItem, 'annotated' | 'skipped'>) {
  const img = allImages.value.find((i) => i.id === id)
  if (img) {
    img.annotated = st.annotated
    img.skipped = st.skipped
  }
}

async function advanceToNext() {
  const next = pendingImages.value[0]
  if (next) {
    await goToImage(next.id)
  } else {
    backToDetail()
  }
}

function onAnnotatorChange(_shapes: Shape[], _meta: Meta) {
  publishShortcutState()
}

onMounted(() => {
  window.addEventListener('keydown', handlePageKeydown, true)
  window.electronAPI?.setShortcutBindings?.({ ...shortcutBindings.value })
  window.electronAPI?.onPageChange?.('annotate')
  scheduleShortcutStatePublish()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handlePageKeydown, true)
  window.electronAPI?.setShortcutState?.({
    page: 'annotate',
    readonly: true,
    canUndo: false,
    canRedo: false,
    hasSelected: false,
    canComplete: false,
    canClear: false,
    canZoom: false
  })
})

watch(
  () => [props.datasetId, props.startImageId],
  async () => {
    await loadDatasetTools()
    await loadImages()
  },
  { immediate: true }
)

watch(
  () => props.readonly,
  () => scheduleShortcutStatePublish()
)
</script>

<style scoped>
.precision-annotation-view {
  height: 100%;
  min-height: 0;
  margin: 0 30px 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(255, 255, 250, 0.78);
  box-shadow: var(--shadow-lg);
}

.precision-annotation-header {
  height: 52px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255, 255, 250, 0.8);
}

.precision-annotation-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
}

.precision-image-rail {
  width: 260px;
  flex: 0 0 260px;
  overflow: hidden;
  border-right: 1px solid var(--border);
  background: var(--bg-subtle);
}

.precision-annotation-canvas {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    linear-gradient(rgba(33, 39, 31, 0.045) 1px, transparent 1px) 0 0 / 38px 38px,
    linear-gradient(90deg, rgba(33, 39, 31, 0.045) 1px, transparent 1px) 0 0 / 38px 38px,
    rgba(255, 255, 250, 0.36);
}

.precision-annotator-shell {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --da-annotator-bg: rgba(238, 240, 232, 0.72);
  --da-annotator-text: var(--text);
  --da-annotator-muted: var(--text-secondary);
  --da-annotator-subtle: var(--text-tertiary);
  --da-annotator-panel-bg: rgba(255, 255, 250, 0.9);
  --da-annotator-canvas-bg: #fffefa;
  --da-annotator-border: var(--border);
  --da-annotator-border-strong: var(--border-strong);
  --da-annotator-divider: rgba(198, 204, 191, 0.72);
  --da-annotator-tool-bg: rgba(255, 255, 250, 0.72);
  --da-annotator-tool-fg: var(--text-secondary);
  --da-annotator-tool-hover-bg: rgba(9, 16, 18, 0.075);
  --da-annotator-tool-active-bg: rgba(9, 16, 18, 0.12);
  --da-annotator-selected-bg: rgba(9, 16, 18, 0.12);
  --da-annotator-selected-border: var(--accent);
  --da-annotator-selected-fg: var(--text);
  --da-annotator-mode-selected-bg: rgba(9, 16, 18, 0.12);
  --da-annotator-mode-selected-border: var(--accent);
  --da-annotator-group-selected-border: var(--accent);
  --da-annotator-action-fg: #ffffff;
  --da-annotator-primary-bg: var(--accent);
  --da-annotator-primary-hover-bg: var(--accent-hover);
  --da-annotator-primary-border: var(--accent);
  --da-annotator-primary-disabled-bg: #d8ddd2;
  --da-annotator-danger-bg: var(--danger);
  --da-annotator-danger-hover-bg: #e84c55;
  --da-annotator-danger-border: var(--danger);
  --da-annotator-danger-soft-bg: var(--danger-light);
  --da-annotator-danger-soft-fg: var(--danger);
  --da-annotator-danger-soft-border: #ffb6bd;
  --da-annotator-list-title: var(--text);
  --da-annotator-shape-title: var(--text);
  --da-annotator-shape-angle: var(--danger);
  --da-annotator-shape-editing: #966400;
  --da-annotator-shape-border: rgba(217, 221, 210, 0.82);
  --da-annotator-shape-hover-bg: rgba(9, 16, 18, 0.045);
  overflow: hidden;
  border-radius: 12px;
  background: var(--da-annotator-bg);
  box-shadow: var(--shadow-lg);
}

.shortcut-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.shortcut-group h3 {
  margin: 0 0 7px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.shortcut-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.shortcut-row {
  min-height: 38px;
  padding: 5px 7px 5px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
}

.shortcut-row:last-child { border-bottom: 0; }
.shortcut-row-actions { display: flex; align-items: center; gap: 3px; }
.shortcut-binding {
  min-width: 82px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  color: var(--text);
  background: var(--bg-subtle);
  font: 700 11px/1 ui-monospace, monospace;
  cursor: pointer;
}
.shortcut-binding.is-recording { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); }
.shortcut-binding.is-conflict { border-color: var(--danger); color: var(--danger); }
.shortcut-clear { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; color: var(--text-tertiary); background: transparent; cursor: pointer; }
.shortcut-clear:hover { color: var(--danger); background: var(--danger-light); }

@media (max-width: 900px) {
  .shortcut-groups { grid-template-columns: 1fr; }
}
</style>
