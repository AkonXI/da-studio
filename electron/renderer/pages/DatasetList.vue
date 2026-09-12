<template>
  <div class="page-wrap dataset-list-page">
    <div class="page-card">
      <header class="dataset-card-header flex items-start justify-between">
        <div>
          <p class="section-kicker">DATASETS</p>
          <h1>标注数据资产</h1>
          <p>共 {{ datasets.length }} 个数据集</p>
        </div>
        <UiButton variant="primary" size="lg" @click="showCreate = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          新建数据集
        </UiButton>
      </header>

      <UiEmpty v-if="datasets.length === 0" description="暂无数据集" />

      <div v-else class="dataset-list">
        <div
          v-for="(ds, i) in datasets"
          :key="ds.id"
          class="dataset-row anim-in"
          :style="{ animationDelay: `${i * 0.04}s` }"
        >
          <div class="dataset-row-card" @click="$router.push(`/datasets/${ds.id}`)">
            <div class="flex items-start justify-between gap-4">
              <div class="dataset-row-main flex-1 min-w-0">
                <div class="dataset-index">{{ String(i + 1).padStart(2, '0') }}</div>
                <div class="min-w-0">
                  <h3>{{ ds.name }}</h3>
                  <div v-if="ds.descriptionText" class="dataset-description">
                    {{ ds.descriptionText }}
                  </div>
                  <div class="dataset-date">{{ ds.created_at }}</div>
                </div>
              </div>
              <div class="dataset-actions flex gap-2 shrink-0" @click.stop>
                <UiButton
                  variant="outline"
                  size="sm"
                  @click.stop="uploadImages(ds.id)"
                  >上传</UiButton
                >
                <UiButton
                  variant="primary"
                  size="sm"
                  :disabled="!ds.canAnnotate"
                  @click.stop="$router.push(`/datasets/${ds.id}/annotate`)"
                  >标注</UiButton
                >
                <UiButton
                  :variant="ds.canEdit ? 'outline' : 'muted'"
                  size="sm"
                  :disabled="!ds.canEdit"
                  @click.stop="showEdit = ds"
                  >编辑</UiButton
                >
                <UiButton
                  variant="danger"
                  size="sm"
                  @click.stop.prevent="requestRemove(ds)"
                  >删除</UiButton
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <DatasetCreateDialog v-if="showCreate" @close="showCreate = false" @saved="handleSaved" />
    <DatasetCreateDialog
      v-if="showEdit"
      :dataset="showEdit"
      @close="showEdit = null"
      @saved="handleSaved"
    />
    <UiDialog
      v-if="pendingDelete"
      :open="true"
      title="删除数据集"
      size="sm"
      :close-disabled="deleting"
      @update:open="(open) => !open && (pendingDelete = null)"
    >
          <p class="da-confirm-text" style="margin: 0">
            确定删除「{{ pendingDelete.name }}」？数据集内图片和标注记录会一起删除。
          </p>
      <template #footer>
          <UiButton
            variant="outline"
            :disabled="deleting"
            @click="pendingDelete = null"
            >取消</UiButton
          >
          <UiButton
            variant="danger"
            :loading="deleting"
            @click="confirmRemove"
            >删除</UiButton
          >
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DatasetCreateDialog from './DatasetCreateDialog.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiEmpty from '../components/ui/UiEmpty.vue'
import { useToast } from '../composables/useToast'

const toast = useToast()

const datasets = ref<any[]>([])
const showCreate = ref(false)
const showEdit = ref<any | null>(null)
const pendingDelete = ref<any | null>(null)
const deleting = ref(false)

function toPlainText(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function load() {
  const list = await window.electronAPI.dataset.list()
  datasets.value = await Promise.all(
    list.map(async (dataset: any) => {
      const images = await window.electronAPI.image.listWithStatus(dataset.id)
      const annotatedCount = images.filter((image: any) => image.annotated).length
      const pendingCount = images.filter((image: any) => !image.annotated && !image.skipped).length
      return {
        ...dataset,
        descriptionText: dataset.description ? toPlainText(dataset.description) : '',
        imageCount: images.length,
        annotatedCount,
        pendingCount,
        canAnnotate: pendingCount > 0,
        canEdit: annotatedCount === 0
      }
    })
  )
}

async function handleSaved() {
  showCreate.value = false
  showEdit.value = null
  await load()
}

async function uploadImages(datasetId: number) {
  const result = await window.electronAPI.image.upload(datasetId)
  if (result.created.length > 0 && result.skipped > 0) {
    toast.success(`上传完成，新增 ${result.created.length} 张，跳过重复 ${result.skipped} 张`)
  } else if (result.created.length > 0) {
    toast.success(`上传完成，共 ${result.created.length} 张`)
  } else if (result.skipped > 0) {
    toast.warning(`已跳过 ${result.skipped} 张重复图片`)
  }
  await load()
}

function requestRemove(ds: any) {
  pendingDelete.value = ds
}

async function confirmRemove() {
  if (!pendingDelete.value || deleting.value) return
  const ds = pendingDelete.value
  deleting.value = true
  try {
    await window.electronAPI.dataset.delete(ds.id)
    pendingDelete.value = null
    toast.success('已删除')
    await load()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>
