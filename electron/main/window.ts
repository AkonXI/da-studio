import { BrowserWindow } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(currentDirname: string): BrowserWindow {
  mainWindow = new BrowserWindow({
    title: 'DA Studio',
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(currentDirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(currentDirname, '../dist/index.html'))
  }
  return mainWindow
}
