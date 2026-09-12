<template>
  <div
    class="da-label-panel w-[210px] shrink-0 min-h-0 border-0 border-l h-full overflow-hidden bg-[var(--da-annotator-panel-bg)] border-[var(--da-annotator-border)]"
  >
    <div
      class="text-sm font-semibold px-4 py-3 border-b text-[var(--da-annotator-list-title)] border-[var(--da-annotator-shape-border)] flex items-center justify-between"
    >
      <span>标注列表</span>
      <span class="da-list-actions">
        <span class="da-shape-count">{{ filteredShapes.length }}/{{ shapes.length }}</span>
        <span v-if="selectedCount > 1" class="da-shape-count">已选 {{ selectedCount }}</span>
        <button
          type="button"
          class="da-visibility-button"
          :title="`${allShapesHidden ? '显示全部标注' : '隐藏全部标注'}；右键${filteredShapesAllHidden ? '显示' : '隐藏'}当前筛选`"
          :aria-label="allShapesHidden ? '显示全部标注' : '隐藏全部标注'"
          :disabled="shapes.length === 0"
          @click="$emit('toggle-all', !allShapesHidden)"
          @contextmenu.prevent="
            $emit(
              'toggle-filtered',
              filteredShapes.map(({ index }) => index),
              !filteredShapesAllHidden
            )
          "
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="allShapesHidden">
              <path
                d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.8 10.8 0 0112 4c5.5 0 9 6 9 6a16 16 0 01-2.2 2.9M6.3 6.3C4.2 7.7 3 10 3 10s3.5 6 9 6a9.8 9.8 0 003.1-.5"
              />
            </template>
            <template v-else>
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
              <circle cx="12" cy="12" r="2.5" />
            </template>
          </svg>
        </button>
      </span>
    </div>
    <div class="da-list-filters">
      <select v-model="groupFilter" aria-label="按分组筛选标注">
        <option value="all">全部分组</option>
        <option v-for="item in groups" :key="item.name" :value="item.name">{{ item.label }}</option>
      </select>
      <select v-model="typeFilter" aria-label="按工具类型筛选标注">
        <option value="all">全部类型</option>
        <option v-for="item in modes" :key="item.type" :value="item.type">{{ item.label }}</option>
      </select>
    </div>
    <div ref="listRef" class="da-annotation-list min-h-0 overflow-y-auto overscroll-contain p-2">
      <div
        v-if="shapes.length === 0"
        class="text-sm text-center mt-10 text-[var(--da-annotator-subtle)]"
      >
        暂无标注<br />点击拖拽开始
      </div>
      <div
        v-for="{ shape: s, index: i } in filteredShapes"
        :key="s.id"
        class="relative px-2.5 pr-8 py-2 mb-1.5 border rounded-md text-xs leading-relaxed cursor-pointer border-[var(--da-annotator-shape-border)] hover:bg-[var(--da-annotator-shape-hover-bg)]"
        :class="{
          'font-bold [&_span]:!text-[var(--da-annotator-current-shape-color)]': s.current,
          'da-shape-hidden': s.hidden
        }"
        :data-current="s.current ? 'true' : undefined"
        :style="{
          borderLeftColor: colorForGroup(s.group),
          borderLeftWidth: '3px',
          '--da-annotator-current-shape-color': colorForGroup(s.group)
        }"
        @click="$emit('select', i)"
        @mouseenter="$emit('hover', i)"
        @mouseleave="$emit('hover', null)"
      >
        <button
          type="button"
          class="da-visibility-button da-shape-visibility"
          :title="s.hidden ? '显示标注' : '隐藏标注'"
          @click.stop="$emit('toggle-one', i, !s.hidden)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              v-if="s.hidden"
              d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.8 10.8 0 0112 4c5.5 0 9 6 9 6a16 16 0 01-2.2 2.9M6.3 6.3C4.2 7.7 3 10 3 10s3.5 6 9 6a9.8 9.8 0 003.1-.5"
            />
            <template v-else>
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
              <circle cx="12" cy="12" r="2.5" />
            </template>
          </svg>
        </button>
        <template v-if="s.type === 'rect'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">矩形 {{ i + 1 }}</span>
          <span v-if="s.rotation" class="text-[var(--da-annotator-shape-angle)]"
            >({{ formatAngle(s.rotation) }})</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >中心: ({{ s.x.toFixed(1) }}, {{ s.y.toFixed(1) }})</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >尺寸: {{ s.w.toFixed(0) }} × {{ s.h.toFixed(0) }}</span
          >
        </template>
        <template v-else-if="s.type === 'point'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">点 {{ i + 1 }}</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >坐标: ({{ s.x.toFixed(1) }}, {{ s.y.toFixed(1) }})</span
          >
        </template>
        <template v-else-if="s.type === 'polyline'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">折线 {{ i + 1 }}</span
          ><span v-if="!s.complete" class="italic text-[var(--da-annotator-shape-editing)]"
            >(编辑中)</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >顶点: {{ s.points.length }}</span
          >
        </template>
        <template v-else-if="s.type === 'polygon'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]"
            >多边形 {{ i + 1 }}</span
          ><span v-if="!s.complete" class="italic text-[var(--da-annotator-shape-editing)]"
            >(编辑中)</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >顶点: {{ s.points.length }}</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >面积: {{ formatMeasure(polygonArea(s.points)) }} px²</span
          >
        </template>
        <template v-else-if="s.type === 'curve'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">曲线 {{ i + 1 }}</span
          ><span v-if="!s.complete" class="italic text-[var(--da-annotator-shape-editing)]"
            >(编辑中)</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >控制点: {{ s.points.length }}</span
          >
        </template>
        <template v-else-if="s.type === 'ellipse'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]"
            >圆形/椭圆 {{ i + 1 }}</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >中心: ({{ s.x.toFixed(1) }}, {{ s.y.toFixed(1) }})</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >尺寸: {{ s.w.toFixed(0) }} × {{ s.h.toFixed(0) }}</span
          >
        </template>
        <template v-else-if="s.type === 'mask'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">Mask {{ i + 1 }}</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >区域: {{ maskStats(s).regions }}</span
          >
          <template v-if="maskStats(s).bounds"
            ><br /><span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
              >区域坐标: {{ formatMaskBounds(maskStats(s).bounds) }}</span
            ></template
          >
        </template>
        <template v-else-if="s.type === 'cuboid'">
          <span class="font-semibold text-[var(--da-annotator-shape-title)]"
            >立方体 {{ i + 1 }}</span
          ><span v-if="!s.complete" class="italic text-[var(--da-annotator-shape-editing)]"
            >(绘制中)</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >估算体积: {{ formatMeasure(cuboidVolume(s.points)) }} px³</span
          >
        </template>
        <template v-else>
          <span class="font-semibold text-[var(--da-annotator-shape-title)]">关节 {{ i + 1 }}</span
          ><span v-if="!s.complete" class="italic text-[var(--da-annotator-shape-editing)]"
            >(编辑中)</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >关键点: {{ jointPlacedCount(s) }} / {{ s.points.length }}</span
          ><br />
          <span class="font-mono text-[11px] text-[var(--da-annotator-muted)]"
            >遮挡点: {{ jointOccludedCount(s) }}</span
          >
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Group, JointShape, MaskShape, ModeType, Shape } from '../../engine/model/types'
import {
  computeMaskStats,
  cuboidVolume,
  formatMaskBounds,
  formatMeasure,
  polygonArea,
  type MaskDisplayStats
} from './shape-metrics'

const props = defineProps<{
  shapes: Shape[]
  groups: Group[]
  modes: { type: ModeType; label: string }[]
  colorForGroup: (group: string) => string
}>()
defineEmits<{
  select: [index: number]
  'toggle-one': [index: number, hidden: boolean]
  'toggle-all': [hidden: boolean]
  'toggle-filtered': [indices: number[], hidden: boolean]
  hover: [index: number | null]
}>()

const listRef = ref<HTMLElement | null>(null)
const groupFilter = ref('all')
const typeFilter = ref<'all' | ModeType>('all')
const filteredShapes = computed(() =>
  props.shapes
    .map((shape, index) => ({ shape, index }))
    .filter(
      ({ shape }) =>
        (groupFilter.value === 'all' || shape.group === groupFilter.value) &&
        (typeFilter.value === 'all' || shape.type === typeFilter.value)
    )
)
const selectedCount = computed(() => props.shapes.filter((shape) => shape.current).length)

function jointPlacedCount(shape: JointShape): number {
  return shape.points.filter((point) => point.visibility > 0).length
}

function jointOccludedCount(shape: JointShape): number {
  return shape.points.filter((point) => point.visibility === 1).length
}
const allShapesHidden = computed(
  () => props.shapes.length > 0 && props.shapes.every((shape) => shape.hidden)
)
const filteredShapesAllHidden = computed(
  () => filteredShapes.value.length > 0 && filteredShapes.value.every(({ shape }) => shape.hidden)
)
const statsCache = new Map<string, { counts: number[]; stats: MaskDisplayStats }>()

function maskStats(shape: MaskShape): MaskDisplayStats {
  const cached = statsCache.get(shape.id)
  if (cached?.counts === shape.bitmap.counts) return cached.stats
  const stats = computeMaskStats(shape)
  statsCache.set(shape.id, { counts: shape.bitmap.counts, stats })
  return stats
}

function formatAngle(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`
}

watch(
  () => props.shapes.find((shape) => shape.current)?.id,
  () =>
    nextTick(() =>
      listRef.value
        ?.querySelector('[data-current="true"]')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    )
)
</script>
