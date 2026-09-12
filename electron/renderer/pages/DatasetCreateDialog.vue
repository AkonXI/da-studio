<template>
  <UiDialog :open="true" :title="dialogTitle" size="lg" @update:open="onOpenChange">
        <label class="da-field">
          <span>名称</span>
          <UiInput v-model="name" placeholder="数据集名称" />
        </label>

        <div class="da-field">
          <span>标注工具</span>
          <div class="da-tool-grid">
            <label
              v-for="tool in toolOptions"
              :key="tool.type"
              class="da-tool-option"
              :class="{ 'is-active': selectedTools.includes(tool.type) }"
            >
              <input v-model="selectedTools" type="checkbox" :value="tool.type" />
              <span>{{ tool.label }}</span>
            </label>
          </div>
        </div>

        <div class="da-field">
          <span>分组配置</span>
          <div class="da-group-grid">
            <div v-for="(group, i) in groups" :key="i" class="da-group-row">
              <input v-model="group.stroke" class="ui-color-input" type="color" :list="`colors-${i}`" />
              <datalist :id="`colors-${i}`">
                <option v-for="color in preColors" :key="color" :value="color" />
              </datalist>
              <UiInput v-model="group.label" placeholder="标签" />
              <button
                type="button"
                class="da-group-remove"
                :disabled="groups.length <= 1"
                @click="groups.splice(i, 1)"
              >
                ×
              </button>
            </div>
          </div>
          <button
            type="button"
            class="da-add-group"
            :disabled="groups.length >= maxGroups"
            @click="addGroup"
          >
            + 添加分组
          </button>
        </div>

        <div class="da-field da-field--editor">
          <span>标注要求</span>
          <RichTextEditor v-model="description" />
        </div>
    <template #footer>
        <UiButton variant="outline" @click="emit('close')">取消</UiButton>
        <UiButton
          variant="primary"
          :disabled="!canSave"
          @click="save"
          >{{ submitText }}</UiButton
        >
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import RichTextEditor from '../components/RichTextEditor.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiInput from '../components/ui/UiInput.vue'
import {
  ANNOTATION_GROUP_COLORS,
  ANNOTATION_MODES,
  MAX_ANNOTATION_GROUPS
} from '../../../src/components/annotation/tool-config'

interface GroupConfig {
  name: string
  stroke: string
  fill: string
  fillHover: string
  label: string
}

const emit = defineEmits<{
  close: []
  saved: []
}>()
const props = defineProps<{ dataset?: any }>()

const name = ref('')
const description = ref('')
const maxGroups = MAX_ANNOTATION_GROUPS
const defaultTools = ANNOTATION_MODES.map((tool) => tool.type)
const selectedTools = ref<string[]>([...defaultTools])
const preColors = ANNOTATION_GROUP_COLORS
const toolOptions = ANNOTATION_MODES

function defaultGroups(): GroupConfig[] {
  return [
    {
      name: 'red',
      stroke: '#e53935',
      fill: 'rgba(229,57,53,0.12)',
      fillHover: 'rgba(229,57,53,0.04)',
      label: '红'
    },
    {
      name: 'yellow',
      stroke: '#f9a825',
      fill: 'rgba(249,168,37,0.12)',
      fillHover: 'rgba(249,168,37,0.04)',
      label: '黄'
    },
    {
      name: 'blue',
      stroke: '#1e88e5',
      fill: 'rgba(30,136,229,0.12)',
      fillHover: 'rgba(30,136,229,0.04)',
      label: '蓝'
    },
    {
      name: 'green',
      stroke: '#43a047',
      fill: 'rgba(67,160,71,0.12)',
      fillHover: 'rgba(67,160,71,0.04)',
      label: '绿'
    }
  ]
}

const groups = reactive<GroupConfig[]>(defaultGroups())
const canSave = computed(() => name.value.trim().length > 0 && selectedTools.value.length > 0)
const isEdit = computed(() => Boolean(props.dataset?.id))
const dialogTitle = computed(() => (isEdit.value ? '编辑数据集' : '新建数据集'))
const submitText = computed(() => (isEdit.value ? '保存' : '创建'))

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}

function addGroup() {
  if (groups.length >= maxGroups) return
  const idx = groups.length
  const name = Array.from({ length: maxGroups }, (_, index) => `group${index + 1}`).find(
    (candidate) => !groups.some((item) => item.name === candidate)
  )
  if (!name) return
  const stroke = preColors[idx % preColors.length]
  const rgb = hexToRgb(stroke)
  groups.push({
    name,
    stroke,
    fill: `rgba(${rgb},0.12)`,
    fillHover: `rgba(${rgb},0.04)`,
    label: ''
  })
}

function hexToRgb(hex: string): string {
  const v = parseInt(hex.replace('#', ''), 16)
  return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`
}

function serializeGroups(): string {
  return JSON.stringify(
    groups.slice(0, maxGroups).map((group) => ({
      ...group,
      fill: `rgba(${hexToRgb(group.stroke)},0.12)`,
      fillHover: `rgba(${hexToRgb(group.stroke)},0.04)`
    }))
  )
}

function resetForm(dataset?: any) {
  name.value = dataset?.name ?? ''
  description.value = dataset?.description ?? ''
  selectedTools.value = dataset?.tools ? JSON.parse(dataset.tools) : [...defaultTools]
  const parsedGroups = dataset?.groups ? JSON.parse(dataset.groups) : defaultGroups()
  groups.splice(0, groups.length, ...parsedGroups.slice(0, maxGroups))
}

async function save() {
  if (!canSave.value) return
  if (isEdit.value) {
    await window.electronAPI.dataset.update(
      props.dataset.id,
      name.value.trim(),
      description.value,
      JSON.stringify(selectedTools.value),
      serializeGroups()
    )
  } else {
    await window.electronAPI.dataset.create(
      name.value.trim(),
      description.value,
      JSON.stringify(selectedTools.value),
      serializeGroups()
    )
  }
  emit('saved')
}

watch(() => props.dataset, resetForm, { immediate: true })
</script>
