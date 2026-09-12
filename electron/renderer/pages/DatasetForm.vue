<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="mb-4">
        <UiButton class="da-back-button" variant="ghost" size="sm" @click="goBack">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          {{ isEdit ? '数据集详情' : '数据集' }}
        </UiButton>
      </div>
      <h1 class="text-xl font-semibold mb-6">{{ isEdit ? '编辑数据集' : '新建数据集' }}</h1>
      <form class="ui-form" @submit.prevent="save">
        <label class="ui-form-field"><span>名称</span><UiInput v-model="name" placeholder="数据集名称" /></label>
        <fieldset class="ui-form-field">
          <legend>标注工具</legend>
          <div class="ui-check-grid">
            <label v-for="t in toolOptions" :key="t.type" class="ui-check-option" :class="{ active: selectedTools.includes(t.type) }">
              <input v-model="selectedTools" type="checkbox" :value="t.type" />{{ t.label }}
            </label>
          </div>
        </fieldset>
        <fieldset class="ui-form-field">
          <legend>分组配置</legend>
          <div class="w-full">
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="(g, i) in groups"
                :key="i"
                class="flex items-center gap-1.5 border rounded px-2 py-1.5"
                style="border-color: var(--border)"
              >
                <input v-model="g.stroke" type="color" class="ui-color-input" :list="`form-colors-${i}`" />
                <datalist :id="`form-colors-${i}`"><option v-for="color in preColors" :key="color" :value="color" /></datalist>
                <UiInput v-model="g.label" placeholder="标签" />
                <UiButton
                  size="icon"
                  variant="ghost"
                  @click="groups.splice(i, 1)"
                  :disabled="groups.length <= 1"
                  >&times;</UiButton
                >
              </div>
            </div>
            <UiButton
              size="sm"
              variant="ghost"
              class="mt-2"
              :disabled="groups.length >= maxGroups"
              @click="addGroup"
              >+ 添加分组</UiButton
            >
          </div>
        </fieldset>
        <label class="ui-form-field ui-form-field--editor"><span>标注要求</span>
          <RichTextEditor v-model="description" />
        </label>
        <div class="ui-form-actions">
          <UiButton
            type="submit"
            variant="primary"
            :disabled="!name.trim() || selectedTools.length === 0"
            >{{ isEdit ? '保存' : '创建' }}</UiButton
          >
          <UiButton variant="outline" @click="goBack">取消</UiButton>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import RichTextEditor from '../components/RichTextEditor.vue'
import UiButton from '../components/ui/UiButton.vue'
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
const router = useRouter()
const route = useRoute()
const isEdit = Boolean(route.params.id)
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
    },
    {
      name: 'yellow',
      stroke: '#f9a825',
      fill: 'rgba(249,168,37,0.12)',
      fillHover: 'rgba(249,168,37,0.04)',
      label: '黄'
    }
  ]
}
const groups = reactive<GroupConfig[]>(defaultGroups())
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
    groups.slice(0, maxGroups).map((g) => ({
      ...g,
      fill: `rgba(${hexToRgb(g.stroke)},0.12)`,
      fillHover: `rgba(${hexToRgb(g.stroke)},0.04)`
    }))
  )
}
function goBack() {
  router.push(isEdit ? `/datasets/${route.params.id}` : '/datasets')
}
onMounted(async () => {
  if (isEdit) {
    const list = await window.electronAPI.dataset.list()
    const ds = list.find((d: any) => d.id === Number(route.params.id))
    if (ds) {
      name.value = ds.name
      description.value = ds.description
      if (ds.tools) selectedTools.value = JSON.parse(ds.tools)
      if (ds.groups) {
        const parsed = JSON.parse(ds.groups)
        groups.length = 0
        parsed.slice(0, maxGroups).forEach((g: any) => groups.push(g))
      }
    }
  }
})
async function save() {
  const tools = JSON.stringify(selectedTools.value)
  const g = serializeGroups()
  if (isEdit) {
    await window.electronAPI.dataset.update(
      Number(route.params.id),
      name.value,
      description.value,
      tools,
      g
    )
  } else {
    await window.electronAPI.dataset.create(name.value, description.value, tools, g)
  }
  goBack()
}
</script>
