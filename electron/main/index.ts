import { app, BrowserWindow, protocol } from 'electron'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { registerShortcutStateIpcHandlers, updateMenu } from './menu/shortcut-state'
import { registerLocalFileProtocol } from './protocols'
import { ensureUploadDir } from './storage'
import { createMainWindow } from './window'

const currentDirname = dirname(fileURLToPath(import.meta.url))

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

function start(): void {
  initDatabase()
  ensureUploadDir()
  registerLocalFileProtocol()
  registerIpcHandlers()
  registerShortcutStateIpcHandlers()
  updateMenu()
  createMainWindow(currentDirname)
}

app.commandLine.appendSwitch('no-sandbox')
app.whenReady().then(start)
process.on('message', (message) => {
  if (message === 'electron-vite&type=hot-reload') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload()
    }
  }
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow(currentDirname)
})
app.on('before-quit', () => {
  closeDatabase()
})
