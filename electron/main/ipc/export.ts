import { dialog, ipcMain } from 'electron'
import { mkdirSync } from 'fs'
import { extname } from 'path'
import { listDatasets } from '../db'
import {
  ensureGroups,
  parseGroups,
  prepareRows,
  sanitizeFilename,
  uniqueDirectory
} from '../export/data'
import { writeDirectoryFormat, writeSingleFormat } from '../export/writers'
import type { ExportFormat } from '../export/types'

const formats: ExportFormat[] = [
  'json',
  'csv',
  'coco',
  'yolo-detect',
  'yolo-segment',
  'voc',
  'labelme',
  'mask'
]

function isDirectoryFormat(format: ExportFormat): boolean {
  return ['yolo-detect', 'yolo-segment', 'voc', 'labelme', 'mask'].includes(format)
}

function extensionFor(format: ExportFormat): 'json' | 'csv' {
  return format === 'csv' ? 'csv' : 'json'
}

function withExtension(filePath: string, extension: string): string {
  return extname(filePath).toLowerCase() === `.${extension}` ? filePath : `${filePath}.${extension}`
}

export function registerExportIpcHandlers(): void {
  ipcMain.handle('annotation:export', async (_event, datasetId: number, rawFormat: string) => {
    const format = rawFormat as ExportFormat
    if (!formats.includes(format)) throw new Error(`Unsupported export format: ${rawFormat}`)
    const dataset = listDatasets().find((item) => item.id === datasetId)
    if (!dataset) throw new Error('Dataset not found')

    const rows = await prepareRows(datasetId)
    const groups = ensureGroups(parseGroups(dataset.groups), rows)
    const datasetName = sanitizeFilename(dataset.name)

    if (isDirectoryFormat(format)) {
      const result = await dialog.showOpenDialog({
        title: '选择导出目录',
        buttonLabel: '导出到此处',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return { canceled: true }
      const directory = uniqueDirectory(result.filePaths[0], `${datasetName}-${format}`)
      mkdirSync(directory, { recursive: true })
      await writeDirectoryFormat(format, directory, rows, groups)
      return { canceled: false, path: directory, count: rows.length }
    }

    const extension = extensionFor(format)
    const result = await dialog.showSaveDialog({
      title: '导出标注',
      defaultPath: `${datasetName}-${format}.${extension}`,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const filePath = withExtension(result.filePath, extension)
    await writeSingleFormat(format, filePath, rows, groups)
    return { canceled: false, path: filePath, count: rows.length }
  })
}
