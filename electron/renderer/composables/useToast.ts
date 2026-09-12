import { ref } from 'vue'

export type ToastTone = 'success' | 'warning' | 'error' | 'info'
export interface ToastItem {
  id: number
  title: string
  tone: ToastTone
  open: boolean
}

const items = ref<ToastItem[]>([])
let nextId = 1

function show(title: string, tone: ToastTone = 'info') {
  items.value.push({ id: nextId++, title, tone, open: true })
}

export function useToast() {
  return {
    items,
    show,
    success: (title: string) => show(title, 'success'),
    warning: (title: string) => show(title, 'warning'),
    error: (title: string) => show(title, 'error'),
    info: (title: string) => show(title, 'info'),
    remove: (id: number) => {
      items.value = items.value.filter((item) => item.id !== id)
    }
  }
}
