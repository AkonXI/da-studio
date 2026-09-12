<script setup lang="ts">
import type { Shape } from '../engine/model/types'
import type { MatchResult } from '../matcher/types'
import { comparableShapes } from '../composables/useComparison'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    shapes: Shape[]
    templateIdx: number | null
    testIdx: number | null
    result: MatchResult | null
    loading: boolean
    teleport?: boolean | string
    sticky?: boolean
    movable?: boolean
    offset?: { top?: number; right?: number; bottom?: number; left?: number }
  }>(),
  {
    teleport: false,
    sticky: false,
    movable: false,
    offset: () => ({ top: 12, right: 12 })
  }
)

const emit = defineEmits<{
  (e: 'select-template', idx: number): void
  (e: 'select-test', idx: number): void
  (e: 'compare'): void
  (e: 'clear-result'): void
  (e: 'clear'): void
}>()

const teleportTo = computed(() => (typeof props.teleport === 'string' ? props.teleport : 'body'))
const dragOffset = ref({ x: 0, y: 0 })
const dragStart = ref<{ x: number; y: number; startX: number; startY: number } | null>(null)
const compareActive = ref(false)
let compareTimer: ReturnType<typeof setTimeout> | null = null

const panelStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.teleport) {
    style.position = 'fixed'
  } else if (props.sticky) {
    style.position = 'absolute'
  } else {
    style.position = 'relative'
  }
  if (props.offset.top != null) style.top = `${props.offset.top}px`
  if (props.offset.right != null) style.right = `${props.offset.right}px`
  if (props.offset.bottom != null) style.bottom = `${props.offset.bottom}px`
  if (props.offset.left != null) style.left = `${props.offset.left}px`
  if (props.movable && (dragOffset.value.x !== 0 || dragOffset.value.y !== 0)) {
    style.transform = `translate(${dragOffset.value.x}px, ${dragOffset.value.y}px)`
  }
  return style
})

function onDragMove(e: PointerEvent) {
  if (!dragStart.value) return
  dragOffset.value = {
    x: dragStart.value.startX + e.clientX - dragStart.value.x,
    y: dragStart.value.startY + e.clientY - dragStart.value.y
  }
}

function stopDrag() {
  dragStart.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', stopDrag)
}

function startDrag(e: PointerEvent) {
  if (!props.movable) return
  const target = e.target as HTMLElement
  if (target.closest('button, select, input, option')) return
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    startX: dragOffset.value.x,
    startY: dragOffset.value.y
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag)
}

function requestCompare() {
  compareActive.value = true
  emit('compare')
}

function clearPanel() {
  compareActive.value = false
  if (compareTimer) {
    clearTimeout(compareTimer)
    compareTimer = null
  }
  emit('clear')
}

watch(
  () => [props.shapes, props.templateIdx, props.testIdx],
  () => {
    if (!compareActive.value) return
    if (props.templateIdx == null || props.testIdx == null) return
    if (compareTimer) clearTimeout(compareTimer)
    emit('clear-result')
    compareTimer = setTimeout(() => {
      emit('compare')
    }, 250)
  },
  { deep: true }
)

watch(
  () => props.result,
  (v) => {
    if (v) compareActive.value = true
  }
)

onUnmounted(() => {
  stopDrag()
  if (compareTimer) clearTimeout(compareTimer)
})
</script>

<template>
  <Teleport :to="teleportTo" :disabled="!teleport">
    <div
      class="z-50 w-[220px] rounded-xl border p-3.5 text-xs shadow-lg bg-[var(--da-compare-panel-bg)] border-[var(--da-compare-panel-border)] text-[var(--da-compare-panel-text)]"
      :style="panelStyle"
    >
      <div
        class="flex justify-between items-center mb-2.5 select-none"
        :class="{ 'cursor-move': movable }"
        @pointerdown="startDrag"
      >
        <span class="font-bold text-[13px] text-[var(--da-compare-panel-title)]">轨迹比对</span>
        <button
          v-if="result"
          class="bg-transparent border-none text-lg cursor-pointer text-[var(--da-compare-panel-muted)] leading-none px-0.5 hover:text-[var(--da-compare-panel-title)]"
          @click="clearPanel"
        >
          &times;
        </button>
      </div>

      <div class="mb-2">
        <label class="block text-[11px] text-[var(--da-compare-panel-muted)] mb-1"
          >模板标注 (A)</label
        >
        <select
          class="w-full py-1.5 px-2 border rounded-md text-xs bg-[var(--da-compare-control-bg)] border-[var(--da-compare-control-border)] text-[var(--da-compare-panel-text)]"
          :value="templateIdx ?? ''"
          @change="emit('select-template', Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>-- 选择模板 --</option>
          <option v-for="s in comparableShapes(shapes)" :key="s.idx" :value="s.idx">
            {{ s.label }}
          </option>
        </select>
      </div>

      <div class="mb-2">
        <label class="block text-[11px] text-[var(--da-compare-panel-muted)] mb-1"
          >测试标注 (B)</label
        >
        <select
          class="w-full py-1.5 px-2 border rounded-md text-xs bg-[var(--da-compare-control-bg)] border-[var(--da-compare-control-border)] text-[var(--da-compare-panel-text)]"
          :value="testIdx ?? ''"
          @change="emit('select-test', Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>-- 选择测试 --</option>
          <option v-for="s in comparableShapes(shapes)" :key="s.idx" :value="s.idx">
            {{ s.label }}
          </option>
        </select>
      </div>

      <button
        class="w-full py-1.5 mt-1.5 border-none rounded-md text-xs font-semibold cursor-pointer text-[var(--da-compare-primary-fg)] bg-[var(--da-compare-primary-bg)] hover:bg-[var(--da-compare-primary-hover-bg)] disabled:bg-[var(--da-compare-primary-disabled-bg)] disabled:text-[var(--da-compare-primary-disabled-fg)] disabled:cursor-not-allowed"
        :disabled="templateIdx == null || testIdx == null || loading"
        @click="requestCompare"
      >
        {{ loading ? '比对中...' : '开始比对' }}
      </button>

      <div v-if="result" class="mt-3 pt-2.5 border-t border-[var(--da-compare-panel-border)]">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-muted)] text-[11px]">包围盒对角线</span>
          <span class="font-mono font-semibold text-xs text-[var(--da-compare-panel-text)]"
            >{{ result.diagonal.toFixed(0) }} px</span
          >
        </div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-muted)] text-[11px]">阈值 E_max</span>
          <span class="font-mono font-semibold text-xs text-[var(--da-compare-panel-text)]"
            >{{ result.eMax.toFixed(1) }} px</span
          >
        </div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-muted)] text-[11px]">最大误差</span>
          <span
            class="flex items-center gap-1.5 font-mono font-semibold text-xs text-[var(--da-compare-panel-text)]"
          >
            <span>{{ result.maxError.toFixed(1) }} px</span>
            <span
              :class="[
                'text-[10px] font-bold px-1.5 py-px rounded-lg uppercase',
                result.maxErrorPass
                  ? 'bg-[var(--da-compare-pass-bg)] text-[var(--da-compare-pass-fg)]'
                  : 'bg-[var(--da-compare-fail-bg)] text-[var(--da-compare-fail-fg)]'
              ]"
            >
              {{ result.maxErrorPass ? 'PASS' : 'FAIL' }}
            </span>
          </span>
        </div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-muted)] text-[11px]">相似度</span>
          <span
            class="flex items-center gap-1.5 font-mono font-semibold text-xs text-[var(--da-compare-panel-text)]"
          >
            <span>{{ (result.similarity * 100).toFixed(1) }}%</span>
            <span
              :class="[
                'text-[10px] font-bold px-1.5 py-px rounded-lg uppercase',
                result.similarityPass
                  ? 'bg-[var(--da-compare-pass-bg)] text-[var(--da-compare-pass-fg)]'
                  : 'bg-[var(--da-compare-fail-bg)] text-[var(--da-compare-fail-fg)]'
              ]"
            >
              {{ result.similarityPass ? 'PASS' : 'FAIL' }}
            </span>
          </span>
        </div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-subtle)] text-[11px]">重合率（参考）</span>
          <span class="font-mono text-[11px] text-[var(--da-compare-panel-subtle)]"
            >{{ (result.coverage * 100).toFixed(1) }}%</span
          >
        </div>
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[var(--da-compare-panel-muted)] text-[11px]">违规点</span>
          <span
            class="font-mono font-semibold text-xs"
            :class="
              result.violations.length > 0
                ? 'text-[var(--da-compare-fail-fg)]'
                : 'text-[var(--da-compare-pass-fg)]'
            "
          >
            {{ result.violations.length }} 个
          </span>
        </div>
        <div
          class="mt-2.5 text-center font-bold text-[13px] py-1.5 rounded-md"
          :class="
            result.maxErrorPass && result.similarityPass
              ? 'bg-[var(--da-compare-pass-bg)] text-[var(--da-compare-pass-fg)]'
              : 'bg-[var(--da-compare-fail-bg)] text-[var(--da-compare-fail-fg)]'
          "
        >
          {{ result.maxErrorPass && result.similarityPass ? '✓ 通过' : '✗ 不通过' }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
