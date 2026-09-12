<template>
  <div class="app-layout">
    <aside class="app-sidebar">
      <div class="app-logo">
        <img :src="appIconUrl" class="w-5 h-5" alt="DA Studio" />
      </div>
      <button
        class="nav-btn"
        :class="{ active: $route.path === '/datasets' || $route.path.startsWith('/datasets/') }"
        @click="$router.push('/datasets')"
        title="数据集"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <path d="M3 3h12v12H3z" />
          <path d="M3 7h12M7 3v12" />
        </svg>
        <span class="tooltip">数据集</span>
      </button>
    </aside>
    <main class="app-main" :class="{ 'is-compact-page': isCompactPage }">
      <header class="app-page-header">
        <div>
          <p>DA STUDIO</p>
          <h1>{{ currentTitle }}</h1>
        </div>
        <span class="app-route-pill">{{ currentPill }}</span>
      </header>
      <router-view />
    </main>
    <UiToaster />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import appIconUrl from './public/icon.svg?url'
import UiToaster from './components/ui/UiToaster.vue'
const route = useRoute()
const titles: Record<string, string> = {
  datasets: '数据集',
  'dataset-detail': '数据集详情',
  'dataset-new': '新建数据集',
  'dataset-edit': '编辑数据集',
  annotate: '标注',
  export: '导出标注'
}
const pageTitles: Record<string, string> = {
  datasets: '数据集',
  'dataset-detail': '数据集详情',
  'dataset-new': '新建数据集',
  'dataset-edit': '编辑数据集',
  annotate: '标注工作台',
  export: '导出标注'
}
const pagePills: Record<string, string> = {
  datasets: 'DATASETS',
  'dataset-detail': 'DATASET',
  'dataset-new': 'CREATE',
  'dataset-edit': 'EDIT',
  annotate: 'ANNOTATE',
  export: 'EXPORT'
}
const datasetOrdinal = ref<number | null>(null)
const currentTitle = computed(() => pageTitles[route.name as string] || 'DA Studio')
const currentPill = computed(() => {
  const name = route.name as string
  if (name === 'dataset-detail') return `DATASET / ${datasetOrdinal.value ?? '-'}`
  if (name === 'annotate') return `ANNOTATE / ${datasetOrdinal.value ?? '-'}`
  return pagePills[name] || 'DA STUDIO'
})
const isCompactPage = computed(() => ['datasets', 'dataset-detail'].includes(route.name as string))
async function loadDatasetOrdinal() {
  const name = route.name as string
  if (!['dataset-detail', 'annotate'].includes(name)) {
    datasetOrdinal.value = null
    return
  }
  const id = Number(route.params.id)
  if (!Number.isFinite(id)) {
    datasetOrdinal.value = null
    return
  }
  const list = await window.electronAPI.dataset.list()
  const index = list.findIndex((dataset: any) => dataset.id === id)
  datasetOrdinal.value = index >= 0 ? index + 1 : id
}
watch(
  () => route.name,
  (name) => {
    const t = titles[name as string] || 'DA Studio'
    document.title = t + ' — DA Studio'
    window.electronAPI?.onPageChange?.(name as string)
  },
  { immediate: true }
)
watch(() => [route.name, route.params.id], loadDatasetOrdinal, { immediate: true })
</script>
