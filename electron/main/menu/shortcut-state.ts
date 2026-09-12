import { ipcMain, Menu } from 'electron'
import { getMainWindow } from '../window'

interface ShortcutState {
  page: string
  readonly: boolean
  canUndo: boolean
  canRedo: boolean
  hasSelected: boolean
  canComplete: boolean
  canClear: boolean
  canZoom: boolean
}
let currentPage = 'datasets'
let shortcutState: ShortcutState = disabledShortcutState()
let shortcutBindings: Record<string, string> = {}
export function registerShortcutStateIpcHandlers(): void {
  ipcMain.on('page:change', (_e, page: string) => {
    currentPage = page
    if (page !== 'annotate') shortcutState = disabledShortcutState(page)
    updateMenu()
  })
  ipcMain.on('shortcut-state:change', (_e, state: ShortcutState) => {
    if (state.page !== 'annotate' || currentPage !== 'annotate') {
      shortcutState = disabledShortcutState(currentPage)
      updateMenu()
      return
    }
    shortcutState = {
      page: 'annotate',
      readonly: Boolean(state.readonly),
      canUndo: Boolean(state.canUndo),
      canRedo: Boolean(state.canRedo),
      hasSelected: Boolean(state.hasSelected),
      canComplete: Boolean(state.canComplete),
      canClear: Boolean(state.canClear),
      canZoom: Boolean(state.canZoom)
    }
    updateMenu()
  })
  ipcMain.on('shortcut-bindings:change', (_e, bindings: Record<string, string>) => {
    shortcutBindings = { ...bindings }
    updateMenu()
  })
}
export function updateMenu(): void {
  Menu.setApplicationMenu(buildMenu())
}
function disabledShortcutState(page = currentPage): ShortcutState {
  return {
    page,
    readonly: true,
    canUndo: false,
    canRedo: false,
    hasSelected: false,
    canComplete: false,
    canClear: false,
    canZoom: false
  }
}
function sendKey(keyCode: string, modifiers: Array<'control' | 'alt' | 'shift'> = []) {
  getMainWindow()?.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
}
function menuShortcut(action: string, fallback: string): string | undefined {
  const binding = shortcutBindings[action] ?? fallback
  return binding ? binding.replace(/^Ctrl(?=\+)/, 'CmdOrCtrl') : undefined
}
function sendShortcut(action: string, fallback: string) {
  const binding = shortcutBindings[action] ?? fallback
  if (!binding) return
  const parts = binding.split('+')
  const keyCode = parts.pop()!
  const normalized: Array<'control' | 'alt' | 'shift'> = []
  for (const modifier of parts) {
    if (modifier === 'Ctrl') normalized.push('control')
    else if (modifier === 'Alt') normalized.push('alt')
    else if (modifier === 'Shift') normalized.push('shift')
  }
  sendKey(keyCode, normalized)
}
function buildMenu(): Menu {
  const isAnnotate = currentPage === 'annotate' && shortcutState.page === 'annotate'
  const canEdit = isAnnotate && !shortcutState.readonly
  const canZoom = isAnnotate && shortcutState.canZoom
  return Menu.buildFromTemplate([
    { label: '文件', submenu: [{ role: 'quit', label: '退出' }] },
    {
      label: '编辑',
      submenu: isAnnotate
        ? [
            {
              label: '撤销',
              accelerator: menuShortcut('undo', 'Ctrl+Z'),
              enabled: canEdit && shortcutState.canUndo,
              click: () => sendShortcut('undo', 'Ctrl+Z')
            },
            {
              label: '重做',
              accelerator: menuShortcut('redo', 'Ctrl+Y'),
              enabled: canEdit && shortcutState.canRedo,
              click: () => sendShortcut('redo', 'Ctrl+Y')
            },
            { type: 'separator' },
            {
              label: '删除选中',
              accelerator: menuShortcut('delete-selected', 'Backspace'),
              enabled: canEdit && shortcutState.hasSelected,
              click: () => sendShortcut('delete-selected', 'Backspace')
            },
            {
              label: '清空全部',
              accelerator: menuShortcut('clear-all', 'Delete'),
              enabled: canEdit && shortcutState.canClear,
              click: () => sendShortcut('clear-all', 'Delete')
            },
            { type: 'separator' },
            {
              label: '完成多边形/折线',
              accelerator: menuShortcut('complete-shape', 'Enter'),
              enabled: canEdit && shortcutState.canComplete,
              click: () => sendShortcut('complete-shape', 'Enter')
            }
          ]
        : [{ label: '无可用操作', enabled: false }]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '放大',
          accelerator: menuShortcut('zoom-in', 'Ctrl+='),
          enabled: canZoom,
          click: () => sendShortcut('zoom-in', 'Ctrl+=')
        },
        {
          label: '缩小',
          accelerator: menuShortcut('zoom-out', 'Ctrl+-'),
          enabled: canZoom,
          click: () => sendShortcut('zoom-out', 'Ctrl+-')
        },
        {
          label: '重置缩放',
          accelerator: menuShortcut('fit-image', 'Ctrl+0'),
          enabled: canZoom,
          click: () => sendShortcut('fit-image', 'Ctrl+0')
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'reload', label: '重新加载' }
      ]
    },
    { label: '帮助', submenu: [{ role: 'about', label: '关于' }] }
  ])
}
