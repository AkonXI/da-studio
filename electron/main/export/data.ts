import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { extname, join, parse } from 'path'
import sharp from 'sharp'
import { getDatasetAnnotations } from '../db'
import { getFilePath } from '../storage'
import type { ExportRow, GroupConfig } from './types'

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function parseGroups(raw: string | null): GroupConfig[] {
  return parseJson<any[]>(raw, []).slice(0, 4).map((group, index) => ({
    id: String(group.id || index + 1),
    name: String(group.name || index + 1),
    label: String(group.label || group.name || index + 1)
  }))
}

export function ensureGroups(groups: GroupConfig[], rows: ExportRow[]): GroupConfig[] {
  if (groups.length > 0) return groups
  const names = new Set<string>()
  rows.forEach((row) =>
    row.parsedShapes.forEach((shape) => names.add(String(shape.group || 'default')))
  )
  return [...names].map((name, index) => ({ id: String(index + 1), name, label: name }))
}

export function categoryIndex(groups: GroupConfig[], name: string): number {
  const index = groups.findIndex((group) => group.name === name)
  return index >= 0 ? index : 0
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '')
  return cleaned || 'untitled'
}

export async function prepareRows(datasetId: number): Promise<ExportRow[]> {
  const rows = getDatasetAnnotations(datasetId)
    .map((row) => ({ ...row, parsedShapes: parseJson<any[]>(row.shapes, []) }))
    .filter((row) => row.parsedShapes.length > 0)
  return Promise.all(
    rows.map(async (row) => {
      let width = row.image_width
      let height = row.image_height
      if (!width || !height) {
        try {
          const metadata = await sharp(getFilePath(row.image_filename)).metadata()
          width = metadata.width ?? 0
          height = metadata.height ?? 0
        } catch {
          // Native JSON/CSV can still be exported when an image is unavailable.
        }
      }
      const sourceName = parse(sanitizeFilename(row.image_name))
      return {
        ...row,
        image_width: width,
        image_height: height,
        parsedShapes: row.parsedShapes,
        meta: parseJson(row.meta, {}),
        exportName: `${row.image_id}-${sourceName.name}${sourceName.ext || extname(row.image_filename)}`
      }
    })
  )
}

export function uniqueDirectory(parent: string, name: string): string {
  let target = join(parent, name)
  if (!existsSync(target)) return target
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19)
  target = join(parent, `${name}-${stamp}`)
  let suffix = 2
  while (existsSync(target)) target = join(parent, `${name}-${stamp}-${suffix++}`)
  return target
}

export function copyImages(rows: ExportRow[], directory: string): void {
  mkdirSync(directory, { recursive: true })
  rows.forEach((row) =>
    copyFileSync(getFilePath(row.image_filename), join(directory, row.exportName))
  )
}
