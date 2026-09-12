import { ipcMain, dialog } from 'electron'
import { listImages, getImage, createImage, deleteImage, getAnnotationStatuses } from '../db'
import { storeFile, computeFileMd5, deleteFile, getFilePath, getLocalFileUrl } from '../storage'
import { basename } from 'path'
import sharp from 'sharp'
export function registerImageIpcHandlers(): void {
  ipcMain.handle('image:upload', async (_e, datasetId: number) => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return { created: [], skipped: 0, total: 0 }
    const seenMd5 = new Set(
      listImages(datasetId)
        .map((image: any) => image.md5)
        .filter(Boolean)
    )
    const created = []
    let skipped = 0
    for (const fp of r.filePaths) {
      const md5 = computeFileMd5(fp)
      if (md5 && seenMd5.has(md5)) {
        skipped += 1
        continue
      }
      if (md5) seenMd5.add(md5)
      const metadata = await sharp(fp).metadata()
      created.push(
        createImage(datasetId, storeFile(fp), basename(fp), md5, metadata.width ?? 0, metadata.height ?? 0)
      )
    }
    return { created, skipped, total: r.filePaths.length }
  })
  ipcMain.handle('image:list', (_e, datasetId: number) => listImages(datasetId))
  ipcMain.handle('image:list-with-status', (_e, datasetId: number) => {
    const m = new Map(getAnnotationStatuses(datasetId).map((s) => [s.image_id, s]))
    return listImages(datasetId).map((img) => ({
      ...img,
      annotated: m.get(img.id)?.annotated ?? false,
      skipped: m.get(img.id)?.skipped ?? false
    }))
  })
  ipcMain.handle('image:get-path', (_e, imageId: number) => {
    const img = getImage(imageId)
    return img ? getFilePath(img.filename) : ''
  })
  ipcMain.handle('image:get-url', (_e, imageId: number) => {
    const img = getImage(imageId)
    return img ? getLocalFileUrl(img.filename) : ''
  })
  ipcMain.handle('image:delete', (_e, id: number) => {
    const img = getImage(id)
    deleteImage(id)
    if (!img) return
    try {
      deleteFile(img.filename)
    } catch (error) {
      console.warn(`Failed to delete uploaded file: ${img.filename}`, error)
    }
  })
}
