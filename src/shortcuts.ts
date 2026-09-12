export type AnnotationShortcutAction =
  | 'toggle-interaction'
  | 'tool-rect'
  | 'tool-point'
  | 'tool-polyline'
  | 'tool-polygon'
  | 'tool-curve'
  | 'tool-ellipse'
  | 'tool-mask'
  | 'tool-cuboid'
  | 'tool-joint'
  | 'tool-sam'
  | 'undo'
  | 'redo'
  | 'complete-shape'
  | 'cancel-shape'
  | 'delete-selected'
  | 'clear-all'
  | 'toggle-labels'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-image'
  | 'pan-up'
  | 'pan-down'
  | 'pan-left'
  | 'pan-right'
  | 'group-1'
  | 'group-2'
  | 'group-3'
  | 'group-4'
  | 'aux-reshape'
  | 'aux-clip'
  | 'aux-merge'
  | 'mask-brush'
  | 'mask-eraser'
  | 'mask-polygon'
  | 'mask-inverse'
  | 'mask-merge'
  | 'complete-image'
  | 'skip-image'
  | 'toggle-image-list'
  | 'open-shortcuts'

export interface ShortcutDefinition {
  action: AnnotationShortcutAction
  label: string
  category: '通用' | '绘制工具' | '辅助工具' | 'Mask' | '视图' | '标注流程'
  defaultBinding: string
}

export const ANNOTATION_SHORTCUTS: ShortcutDefinition[] = [
  { action: 'toggle-interaction', label: '切换绘制/编辑', category: '通用', defaultBinding: 'Tab' },
  { action: 'undo', label: '撤销', category: '通用', defaultBinding: 'Ctrl+Z' },
  { action: 'redo', label: '重做', category: '通用', defaultBinding: 'Ctrl+Y' },
  { action: 'complete-shape', label: '完成当前图形', category: '通用', defaultBinding: 'Enter' },
  { action: 'cancel-shape', label: '取消当前绘制', category: '通用', defaultBinding: 'Escape' },
  { action: 'delete-selected', label: '删除选中', category: '通用', defaultBinding: 'Backspace' },
  { action: 'clear-all', label: '清空全部', category: '通用', defaultBinding: 'Delete' },
  {
    action: 'toggle-labels',
    label: '显示/隐藏标注标签',
    category: '通用',
    defaultBinding: 'Shift+L'
  },
  { action: 'open-shortcuts', label: '快捷键管理', category: '通用', defaultBinding: 'Ctrl+/' },
  { action: 'tool-rect', label: '矩形', category: '绘制工具', defaultBinding: '1' },
  { action: 'tool-point', label: '点', category: '绘制工具', defaultBinding: '2' },
  { action: 'tool-polyline', label: '折线', category: '绘制工具', defaultBinding: '3' },
  { action: 'tool-polygon', label: '多边形', category: '绘制工具', defaultBinding: '4' },
  { action: 'tool-curve', label: '曲线', category: '绘制工具', defaultBinding: '5' },
  { action: 'tool-ellipse', label: '圆形/椭圆', category: '绘制工具', defaultBinding: '6' },
  { action: 'tool-mask', label: 'Mask', category: '绘制工具', defaultBinding: '7' },
  { action: 'tool-cuboid', label: '立方体', category: '绘制工具', defaultBinding: '8' },
  { action: 'tool-joint', label: '关节', category: '绘制工具', defaultBinding: '9' },
  { action: 'tool-sam', label: 'SAM 分割', category: '绘制工具', defaultBinding: '0' },
  { action: 'aux-reshape', label: '快捷修改', category: '辅助工具', defaultBinding: 'Shift+R' },
  { action: 'aux-clip', label: '路径裁剪', category: '辅助工具', defaultBinding: 'Shift+C' },
  { action: 'aux-merge', label: '多边形合并', category: '辅助工具', defaultBinding: 'Shift+M' },
  { action: 'mask-brush', label: 'Mask 画笔', category: 'Mask', defaultBinding: 'Alt+B' },
  { action: 'mask-eraser', label: 'Mask 橡皮', category: 'Mask', defaultBinding: 'Alt+E' },
  { action: 'mask-polygon', label: '多边形创建 Mask', category: 'Mask', defaultBinding: 'Alt+P' },
  { action: 'mask-inverse', label: '多边形裁剪 Mask', category: 'Mask', defaultBinding: 'Alt+C' },
  { action: 'mask-merge', label: '融合 Mask', category: 'Mask', defaultBinding: 'Alt+M' },
  { action: 'zoom-in', label: '放大', category: '视图', defaultBinding: 'Ctrl+=' },
  { action: 'zoom-out', label: '缩小', category: '视图', defaultBinding: 'Ctrl+-' },
  { action: 'fit-image', label: '适应图片', category: '视图', defaultBinding: 'Ctrl+0' },
  { action: 'pan-up', label: '向上平移', category: '视图', defaultBinding: 'ArrowUp' },
  { action: 'pan-down', label: '向下平移', category: '视图', defaultBinding: 'ArrowDown' },
  { action: 'pan-left', label: '向左平移', category: '视图', defaultBinding: 'ArrowLeft' },
  { action: 'pan-right', label: '向右平移', category: '视图', defaultBinding: 'ArrowRight' },
  { action: 'group-1', label: '分组 1', category: '通用', defaultBinding: 'Alt+1' },
  { action: 'group-2', label: '分组 2', category: '通用', defaultBinding: 'Alt+2' },
  { action: 'group-3', label: '分组 3', category: '通用', defaultBinding: 'Alt+3' },
  { action: 'group-4', label: '分组 4', category: '通用', defaultBinding: 'Alt+4' },
  {
    action: 'complete-image',
    label: '保存并完成图片',
    category: '标注流程',
    defaultBinding: 'Ctrl+Enter'
  },
  { action: 'skip-image', label: '跳过图片', category: '标注流程', defaultBinding: 'Ctrl+Shift+X' },
  {
    action: 'toggle-image-list',
    label: '显示/隐藏待标注',
    category: '标注流程',
    defaultBinding: 'Ctrl+B'
  }
]

export type ShortcutBindings = Record<AnnotationShortcutAction, string>

export function defaultShortcutBindings(): ShortcutBindings {
  return Object.fromEntries(
    ANNOTATION_SHORTCUTS.map((definition) => [definition.action, definition.defaultBinding])
  ) as ShortcutBindings
}

function eventKey(event: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null
  if (event.code === 'Equal') return '='
  if (event.code === 'Minus') return '-'
  if (event.code.startsWith('Digit')) return event.code.slice(5)
  if (event.code.startsWith('Key')) return event.code.slice(3)
  if (event.key === ' ') return 'Space'
  if (event.key.length === 1) return event.key.toUpperCase()
  return event.key
}

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = eventKey(event)
  if (!key) return null
  const modifiers: string[] = []
  if (event.ctrlKey || event.metaKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey && key.length > 1) modifiers.push('Shift')
  else if (event.shiftKey && !['=', '-'].includes(key)) modifiers.push('Shift')
  return [...modifiers, key].join('+')
}

export function matchesShortcut(event: KeyboardEvent, binding?: string): boolean {
  return Boolean(binding && shortcutFromEvent(event) === binding)
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(
    element &&
    (element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable)
  )
}
