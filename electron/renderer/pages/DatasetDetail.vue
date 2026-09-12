<template>
  <div class="page-wrap dataset-detail-page">
    <div class="page-card">
      <div class="detail-back">
        <UiButton variant="ghost" size="sm" class="da-back-button" @click="$router.push('/datasets')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          数据集
        </UiButton>
      </div>

      <div v-if="dataset" class="detail-hero">
        <div>
          <p class="section-kicker">DATASET</p>
          <h1>{{ dataset.name }}</h1>
          <div v-if="dataset.description" class="detail-description-wrap">
            <div
              ref="detailDescriptionRef"
              :class="[
                'detail-description',
                { 'is-collapsed': !descriptionExpanded, 'is-expanded': descriptionExpanded }
              ]"
              v-html="dataset.description"
            ></div>
            <button
              v-if="descriptionExpandable"
              type="button"
              class="detail-description-toggle"
              @click="toggleDescription"
            >
              {{ descriptionExpanded ? '收起' : '展开' }}
            </button>
          </div>
        </div>
        <div class="detail-actions">
          <UiButton
            variant="outline"
            :disabled="images.length === 0"
            @click="showExport = true"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>
            导出
          </UiButton>
          <UiButton
            variant="primary"
            :disabled="pendingCount === 0"
            @click="$router.push(`/datasets/${$route.params.id}/annotate`)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 13 9-6 1.5-2.5 6Z" /></svg>
            开始标注
          </UiButton>
        </div>
      </div>

      <div v-if="dataset" class="detail-stats">
        <div>
          <span>全部</span>
          <strong>{{ images.length }}</strong>
        </div>
        <div>
          <span>已标注</span>
          <strong>{{ annotatedCount }}</strong>
        </div>
        <div>
          <span>已跳过</span>
          <strong>{{ skippedCount }}</strong>
        </div>
        <div>
          <span>待标注</span>
          <strong>{{ pendingCount }}</strong>
        </div>
        <div>
          <span>创建</span>
          <strong class="detail-date">{{ dataset.created_at }}</strong>
        </div>
      </div>

      <ExportDialog
        v-if="showExport"
        :dataset-id="Number($route.params.id)"
        @close="showExport = false"
      />

      <div v-if="images.length > 0" class="ui-data-table-wrap dataset-image-table">
        <table class="ui-data-table">
          <thead><tr><th style="width: 50px">#</th><th>原始文件名</th><th>MD5</th><th class="is-center" style="width: 150px">状态</th><th class="is-center" style="width: 210px">操作</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in images" :key="row.id">
              <td>{{ index + 1 }}</td>
              <td><span class="detail-file-name">{{ row.original_name }}</span></td>
              <td><span class="detail-md5">{{ row.md5 || '-' }}</span></td>
              <td class="is-center">
                <UiBadge v-if="row.annotated" variant="success">已标注</UiBadge>
                <UiBadge v-else-if="row.skipped" variant="warning">已跳过</UiBadge>
                <UiBadge v-else variant="info">未标注</UiBadge>
              </td>
              <td class="is-center">
                <div class="detail-row-actions">
                  <UiButton size="sm" variant="table" @click.stop="$router.push(`/datasets/${$route.params.id}/annotate/${row.id}`)">标注</UiButton>
                  <UiButton v-if="row.annotated || row.skipped" size="sm" variant="outline" @click.stop="$router.push(`/datasets/${$route.params.id}/annotate/${row.id}?readonly=1`)">查看</UiButton>
                  <UiButton size="sm" variant="danger" @click.stop.prevent="requestRemoveImage(row)">删除</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiEmpty v-else-if="dataset" description="暂无图片" />
    </div>
    <UiDialog
      v-if="pendingDeleteImage"
      :open="true"
      title="删除图片"
      size="sm"
      :close-disabled="deletingImage"
      @update:open="(open) => !open && (pendingDeleteImage = null)"
    >
          <p class="da-confirm-text" style="margin: 0">
            确定删除「{{ pendingDeleteImage.original_name }}」？对应标注记录会一起删除。
          </p>
      <template #footer>
          <UiButton
            variant="outline"
            :disabled="deletingImage"
            @click="pendingDeleteImage = null"
            >取消</UiButton
          >
          <UiButton
            variant="danger"
            :loading="deletingImage"
            @click="confirmRemoveImage"
            >删除</UiButton
          >
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import ExportDialog from './ExportDialog.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiEmpty from '../components/ui/UiEmpty.vue'
import { useToast } from '../composables/useToast'

const route = useRoute()
const toast = useToast()
const dataset = ref<any>(null)
const images = ref<any[]>([])
const showExport = ref(false)
const detailDescriptionRef = ref<HTMLElement | null>(null)
const descriptionExpanded = ref(false)
const descriptionExpandable = ref(false)
const pendingDeleteImage = ref<any | null>(null)
const deletingImage = ref(false)
const annotatedCount = computed(() => images.value.filter((i: any) => i.annotated).length)
const skippedCount = computed(() => images.value.filter((i: any) => i.skipped).length)
const pendingCount = computed(
  () => images.value.filter((i: any) => !i.annotated && !i.skipped).length
)

async function load() {
  const id = Number(route.params.id)
  const list = await window.electronAPI.dataset.list()
  dataset.value = list.find((d: any) => d.id === id) ?? null
  images.value = await window.electronAPI.image.listWithStatus(id)
  descriptionExpanded.value = false
  await nextTick()
  measureDescription()
}

function measureDescription() {
  const el = detailDescriptionRef.value
  if (!el) {
    descriptionExpandable.value = false
    return
  }
  if (descriptionExpanded.value) return
  descriptionExpandable.value = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight
}

async function toggleDescription() {
  descriptionExpanded.value = !descriptionExpanded.value
  await nextTick()
  if (!descriptionExpanded.value) measureDescription()
}

function requestRemoveImage(image: any) {
  pendingDeleteImage.value = image
}

async function confirmRemoveImage() {
  if (!pendingDeleteImage.value || deletingImage.value) return
  const image = pendingDeleteImage.value
  deletingImage.value = true
  try {
    await window.electronAPI.image.delete(image.id)
    pendingDeleteImage.value = null
    toast.success('已删除')
    await load()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败')
  } finally {
    deletingImage.value = false
  }
}

watch(() => route.params.id, load, { immediate: true })
onMounted(() => {
  window.addEventListener('resize', measureDescription)
})
onUnmounted(() => {
  window.removeEventListener('resize', measureDescription)
})
</script>
