import { ipcMain } from 'electron'
import { getAnnotation, saveAnnotation, saveSkip } from '../db'
export function registerAnnotationIpcHandlers(): void {
  ipcMain.handle('annotation:get', (_e, imageId: number) => getAnnotation(imageId) ?? null)
  ipcMain.handle('annotation:save', (_e, imageId: number, shapes: string, meta: string) =>
    saveAnnotation(imageId, shapes, meta)
  )
  ipcMain.handle('annotation:skip', (_e, imageId: number) => saveSkip(imageId))
}
