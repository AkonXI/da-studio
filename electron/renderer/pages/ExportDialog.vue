<template>
  <UiDialog
    :open="true"
    title="导出标注"
    description="选择与下游训练或复核流程匹配的格式"
    :close-disabled="exporting"
    @update:open="onOpenChange"
  >
        <div class="da-export-options">
          <label
            v-for="option in formatOptions"
            :key="option.value"
            class="da-export-option"
            :class="{ active: format === option.value }"
          >
            <input v-model="format" type="radio" :value="option.value" />
            <span>
              <strong>{{ option.label }}</strong>
              <small>{{ option.description }}</small>
            </span>
          </label>
        </div>
    <template #footer>
        <UiButton variant="outline" :disabled="exporting" @click="close"
          >取消</UiButton
        >
        <UiButton
          variant="primary"
          :loading="exporting"
          @click="doExport"
          >导出</UiButton
        >
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import { useToast } from '../composables/useToast'

const props = defineProps<{ datasetId?: number }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const datasetId = computed(() => props.datasetId ?? Number(route.params.id))
type ExportFormat =
  | 'coco'
  | 'yolo-detect'
  | 'yolo-segment'
  | 'voc'
  | 'labelme'
  | 'mask'
  | 'json'
  | 'csv'

const formatOptions: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'coco', label: 'COCO JSON', description: '检测、关键点、Polygon 与 Mask RLE' },
  { value: 'yolo-detect', label: 'YOLO Detection', description: '归一化 xywh 标签、图片与 data.yaml' },
  { value: 'yolo-segment', label: 'YOLO Segmentation', description: '归一化多边形标签；Mask 请用 COCO/RLE' },
  { value: 'voc', label: 'Pascal VOC', description: 'XML 检测框、JPEGImages 与 Annotations' },
  { value: 'labelme', label: 'LabelMe JSON', description: '逐图 JSON，Mask 使用 bbox + 内嵌 PNG' },
  { value: 'mask', label: 'Bitmap Mask + RLE', description: '紧致 bbox PNG 与压缩 COCO RLE counts' },
  { value: 'json', label: 'DA Studio JSON', description: '无损保留全部图形、Mask 位图与立方体控制点' },
  { value: 'csv', label: 'CSV', description: '表格化明细，可导入 Excel 等工具' }
]

const format = ref<ExportFormat>('coco')
const exporting = ref(false)

function close() {
  if (props.datasetId) emit('close')
  else router.push(`/datasets/${datasetId.value}`)
}

function onOpenChange(open: boolean) {
  if (!open && !exporting.value) close()
}

async function doExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const result = await window.electronAPI.annotation.export(datasetId.value, format.value)
    if (result?.canceled) return
    toast.success(`已导出 ${result?.count ?? 0} 张图片的标注`)
    close()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}
</script>
