export interface ImageItem {
  id: number
  dataset_id: number
  filename: string
  original_name: string
  md5: string
  width: number
  height: number
  created_at: string
  annotated: boolean
  skipped: boolean
}

export interface AnnotationShortcutState {
  page: string
  readonly: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelected: boolean
  canComplete: boolean
  canClear: boolean
  canZoom: boolean
}
