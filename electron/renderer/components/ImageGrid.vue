<template>
  <div class="pending-grid">
    <div class="pending-grid__header">
      <span>待标注</span>
      <span>{{ images.length }}</span>
    </div>
    <div class="pending-grid__body">
      <div v-if="images.length > 0" class="pending-grid__list">
        <div
          v-for="img in images"
          :key="img.id"
          class="pending-grid__item"
          :class="{ 'is-selected': img.id === selectedId }"
          @click="select(img.id)"
        >
          <img
            v-if="pathCache[img.id]"
            :src="pathCache[img.id]"
            class="pending-grid__thumb"
            @load="cachePath(img)"
            @error="loadFailed(img)"
          />
          <div class="pending-image-meta">
            <div class="pending-image-name truncate">{{ img.original_name }}</div>
            <div class="pending-image-md5 truncate">{{ img.md5 || '-' }}</div>
          </div>
        </div>
      </div>
      <div v-else class="pending-grid__empty">
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <p class="m-0">全部已标注</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ images: any[]; selectedId: number | null }>()
const emit = defineEmits<{ select: [id: number] }>()
const pathCache = ref<Record<number, string>>({})
async function cachePath(img: any) {
  if (!pathCache.value[img.id]) {
    const url = await window.electronAPI.image.getUrl?.(img.id)
    if (url) {
      pathCache.value[img.id] = url
      return
    }
    const p = await window.electronAPI.image.getPath(img.id)
    const filename = p.split(/[/\\]/).pop()
    pathCache.value[img.id] = filename
      ? `local-file://uploads/${encodeURIComponent(filename)}`
      : ''
  }
}
function loadFailed(img: any) {
  pathCache.value[img.id] = ''
}
function select(id: number) {
  emit('select', id)
}
watch(
  () => props.images,
  (imgs) => {
    for (const img of imgs) cachePath(img)
  },
  { immediate: true }
)
</script>

<style scoped>
.pending-grid {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(239, 241, 232, 0.82);
}

.pending-grid__header {
  height: 42px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text-tertiary);
  background: rgba(239, 241, 232, 0.92);
  font-size: 12px;
  font-weight: 900;
}

.pending-grid__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px;
}

.pending-grid__list {
  display: grid;
  grid-template-columns: 1fr;
  grid-auto-rows: 68px;
  align-content: start;
  gap: 2px;
}

.pending-grid__item {
  position: relative;
  height: 68px;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #fffefa;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition:
    border-color var(--transition),
    background var(--transition),
    box-shadow var(--transition);
}

.pending-grid__item.is-selected {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 14px 24px rgba(20, 24, 18, 0.16);
}

.pending-grid__thumb {
  width: 58px;
  height: 58px;
  display: block;
  margin: 5px;
  border-radius: 10px;
  object-fit: cover;
  object-position: center;
}

.pending-image-meta {
  position: absolute;
  top: 50%;
  right: 10px;
  left: 68px;
  transform: translateY(-50%);
  color: #3f4945;
  background: transparent;
  font-size: 10px;
  font-weight: 900;
}

.pending-image-md5 {
  margin-top: 2px;
  color: #7a8580;
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
}

.pending-grid__item.is-selected .pending-image-meta,
.pending-grid__item.is-selected .pending-image-md5 {
  color: #fffefa;
}

.pending-grid__empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 12px;
  text-align: center;
}

.pending-grid__empty svg {
  width: 28px;
  height: 28px;
  margin: 0 auto 8px;
  opacity: 0.3;
}
</style>
