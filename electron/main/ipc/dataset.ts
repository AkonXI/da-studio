import { ipcMain } from 'electron'
import { listDatasets, createDataset, updateDataset, deleteDataset, listImages } from '../db'
import { deleteFile } from '../storage'

export function registerDatasetIpcHandlers(): void {
  ipcMain.handle('dataset:list', () => listDatasets())
  ipcMain.handle(
    'dataset:create',
    (_e, name: string, description: string, tools: string, groups: string) =>
      createDataset(name, description, tools, groups)
  )
  ipcMain.handle(
    'dataset:update',
    (_e, id: number, name: string, description: string, tools: string, groups: string) =>
      updateDataset(id, name, description, tools, groups)
  )
  ipcMain.handle('dataset:delete', (_e, id: number) => {
    const images = listImages(id)
    deleteDataset(id)
    for (const img of images) {
      try {
        deleteFile(img.filename)
      } catch (error) {
        console.warn(`Failed to delete uploaded file: ${img.filename}`, error)
      }
    }
  })
}
