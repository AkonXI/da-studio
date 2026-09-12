import { mkdirSync, writeFileSync } from 'fs'
import { join, parse } from 'path'
import { categoryIndex, copyImages } from './data'
import { polygonArea, shapeBounds, shapePoints } from './geometry'
import {
  COCO_PERSON_KEYPOINTS,
  COCO_PERSON_SKELETON,
  cocoSkeletonForExport
} from '../../../src/engine/joint/coco-person'
import { cocoRle, maskPng, renderMask } from './mask-rle'
import type { ExportFormat, ExportRow, GroupConfig, RenderedMask } from './types'

function csv(value: unknown): string {
  return `"${(value == null ? '' : String(value)).replace(/"/g, '""')}"`
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalized(value: number, size: number): string {
  return Math.max(0, Math.min(1, value / Math.max(1, size))).toFixed(6)
}

function nativeGroupMap(groups: GroupConfig[]): Map<string, string> {
  return new Map(groups.map((group) => [group.name, group.id]))
}

function writeNative(filePath: string, rows: ExportRow[], groups: GroupConfig[]): void {
  const groupMap = nativeGroupMap(groups)
  writeFileSync(
    filePath,
    JSON.stringify(
      rows.map((row) => ({
        image_md5: row.image_md5 || String(row.image_id),
        image_name: row.image_name,
        width: row.image_width,
        height: row.image_height,
        shapes: row.parsedShapes.map((shape) => {
          const { group, current, ...rest } = shape
          return { ...rest, group_id: groupMap.get(group) || group }
        }),
        meta: row.meta
      })),
      null,
      2
    ),
    'utf-8'
  )
}

function writeCsv(filePath: string, rows: ExportRow[], groups: GroupConfig[]): void {
  const groupMap = nativeGroupMap(groups)
  const lines = [
    'image_md5,image_name,image_width,image_height,annotation_uuid,shape_type,group_id,x,y,w,h,rotation,complete,points,mask_bitmap'
  ]
  for (const row of rows) {
    for (const shape of row.parsedShapes) {
      const prefix = [
        csv(row.image_md5 || String(row.image_id)),
        csv(row.image_name),
        row.image_width,
        row.image_height,
        csv(shape.id),
        csv(shape.type),
        csv(groupMap.get(shape.group) || shape.group)
      ].join(',')
      if (shape.type === 'rect' || shape.type === 'ellipse') {
        lines.push(
          `${prefix},${shape.x},${shape.y},${shape.w},${shape.h},${shape.rotation || 0},,,`
        )
      } else if (shape.type === 'point') {
        lines.push(`${prefix},${shape.x},${shape.y},,,,,,`)
      } else if (shape.type === 'mask') {
        lines.push(`${prefix},,,,,,,,${csv(JSON.stringify(shape.bitmap))}`)
      } else {
        const points = (shape.points || []).map((point: any) => `${point.x},${point.y}`).join(';')
        lines.push(`${prefix},,,,,,${shape.complete ?? true},${csv(points)},`)
      }
    }
  }
  writeFileSync(filePath, '\uFEFF' + lines.join('\n'), 'utf-8')
}

async function renderedMask(row: ExportRow, shape: any): Promise<RenderedMask | null> {
  if (shape.type !== 'mask' || !row.image_width || !row.image_height) return null
  return renderMask(shape, row.image_width, row.image_height)
}

async function bounds(row: ExportRow, shape: any): Promise<[number, number, number, number]> {
  if (shape.type !== 'mask') return shapeBounds(shape)
  return (await renderedMask(row, shape))?.bbox ?? [0, 0, 0, 0]
}

async function writeCoco(
  filePath: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  const annotations: any[] = []
  const jointGroups = new Set(
    rows.flatMap((row) =>
      row.parsedShapes.filter((shape) => shape.type === 'joint').map((shape) => shape.group)
    )
  )
  let annotationId = 1
  for (const row of rows) {
    for (const shape of row.parsedShapes) {
      const mask = await renderedMask(row, shape)
      const points = shape.type === 'mask' ? [] : shapePoints(shape)
      const bbox = mask?.bbox ?? shapeBounds(shape)
      const closed =
        ['rect', 'polygon', 'ellipse', 'cuboid'].includes(shape.type) && points.length >= 3
      annotations.push({
        id: annotationId++,
        image_id: row.image_id,
        category_id: categoryIndex(groups, shape.group) + 1,
        bbox,
        area: mask?.area ?? (closed ? polygonArea(points) : bbox[2] * bbox[3]),
        segmentation: mask
          ? cocoRle(mask, row.image_width, row.image_height)
          : closed
            ? [points.flatMap((point) => [point.x, point.y])]
            : [],
        iscrowd: 0,
        ...(shape.type === 'point'
          ? { keypoints: [Number(shape.x), Number(shape.y), 2], num_keypoints: 1 }
          : shape.type === 'joint'
            ? {
                keypoints: COCO_PERSON_KEYPOINTS.flatMap((_, index) => {
                  const point = shape.points?.[index]
                  const visibility = [0, 1, 2].includes(Number(point?.visibility))
                    ? Number(point.visibility)
                    : 0
                  return visibility > 0 ? [Number(point.x), Number(point.y), visibility] : [0, 0, 0]
                }),
                num_keypoints:
                  shape.points?.filter((point: any) => point.visibility > 0).length || 0
              }
            : {}),
        attributes: {
          annotation_uuid: shape.id,
          shape_type: shape.type,
          ...(['rect', 'ellipse'].includes(shape.type) ? { rotation: shape.rotation || 0 } : {}),
          ...(shape.type === 'curve' ? { control_points: shape.points } : {}),
          ...(shape.type === 'cuboid' ? { control_points: shape.points } : {}),
          ...(shape.type === 'joint' ? { skeleton: 'coco-person-17' } : {})
        }
      })
    }
  }
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        info: {
          description: 'DA Studio export',
          version: '1.0',
          date_created: new Date().toISOString()
        },
        licenses: [],
        images: rows.map((row) => ({
          id: row.image_id,
          file_name: row.image_name,
          width: row.image_width,
          height: row.image_height
        })),
        annotations,
        categories: groups.map((group, index) => ({
          id: index + 1,
          name: group.label,
          supercategory: 'object',
          ...(jointGroups.has(group.name)
            ? {
                keypoints: COCO_PERSON_KEYPOINTS.map((point) => point.name),
                skeleton: cocoSkeletonForExport()
              }
            : {})
        }))
      },
      null,
      2
    ),
    'utf-8'
  )
}

function writeYaml(directory: string, groups: GroupConfig[]): void {
  const names = groups
    .map((group, index) => `  ${index}: ${JSON.stringify(group.label)}`)
    .join('\n')
  writeFileSync(
    join(directory, 'data.yaml'),
    `path: .\ntrain: images\nval: images\nnames:\n${names}\n`,
    'utf-8'
  )
}

async function writeYoloDetect(
  directory: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  const labelDirectory = join(directory, 'labels')
  mkdirSync(labelDirectory, { recursive: true })
  copyImages(rows, join(directory, 'images'))
  writeYaml(directory, groups)
  for (const row of rows) {
    const lines: string[] = []
    for (const shape of row.parsedShapes) {
      const [x, y, width, height] = await bounds(row, shape)
      lines.push(
        [
          categoryIndex(groups, shape.group),
          normalized(x + width / 2, row.image_width),
          normalized(y + height / 2, row.image_height),
          normalized(width, row.image_width),
          normalized(height, row.image_height)
        ].join(' ')
      )
    }
    writeFileSync(
      join(labelDirectory, `${parse(row.exportName).name}.txt`),
      lines.join('\n'),
      'utf-8'
    )
  }
}

function writeYoloSegment(directory: string, rows: ExportRow[], groups: GroupConfig[]): void {
  const labelDirectory = join(directory, 'labels')
  mkdirSync(labelDirectory, { recursive: true })
  copyImages(rows, join(directory, 'images'))
  writeYaml(directory, groups)
  let skipped = 0
  for (const row of rows) {
    const lines: string[] = []
    for (const shape of row.parsedShapes) {
      if (!['rect', 'polygon', 'ellipse', 'cuboid'].includes(shape.type)) {
        skipped++
        continue
      }
      const points = shapePoints(shape)
      if (points.length < 3) {
        skipped++
        continue
      }
      lines.push(
        [
          categoryIndex(groups, shape.group),
          ...points.flatMap((point) => [
            normalized(point.x, row.image_width),
            normalized(point.y, row.image_height)
          ])
        ].join(' ')
      )
    }
    writeFileSync(
      join(labelDirectory, `${parse(row.exportName).name}.txt`),
      lines.join('\n'),
      'utf-8'
    )
  }
  if (skipped > 0) {
    writeFileSync(
      join(directory, 'EXPORT_NOTES.txt'),
      `${skipped} Mask/point/polyline/curve annotations were omitted. Use COCO or Bitmap Mask + RLE to retain raster masks.\n`,
      'utf-8'
    )
  }
}

async function writeVoc(
  directory: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  const annotationDirectory = join(directory, 'Annotations')
  mkdirSync(annotationDirectory, { recursive: true })
  copyImages(rows, join(directory, 'JPEGImages'))
  for (const row of rows) {
    const objects: string[] = []
    for (const shape of row.parsedShapes) {
      const [x, y, width, height] = await bounds(row, shape)
      const label = groups[categoryIndex(groups, shape.group)]?.label || 'object'
      objects.push(
        `  <object>\n    <name>${xml(label)}</name>\n    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n    <difficult>0</difficult>\n    <bndbox>\n      <xmin>${Math.max(0, Math.floor(x))}</xmin>\n      <ymin>${Math.max(0, Math.floor(y))}</ymin>\n      <xmax>${Math.min(row.image_width, Math.ceil(x + width))}</xmax>\n      <ymax>${Math.min(row.image_height, Math.ceil(y + height))}</ymax>\n    </bndbox>\n  </object>`
      )
    }
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<annotation>\n  <folder>JPEGImages</folder>\n  <filename>${xml(row.exportName)}</filename>\n  <path>JPEGImages/${xml(row.exportName)}</path>\n  <source><database>DA Studio</database></source>\n  <size><width>${row.image_width}</width><height>${row.image_height}</height><depth>3</depth></size>\n  <segmented>0</segmented>\n${objects.join('\n')}\n</annotation>\n`
    writeFileSync(join(annotationDirectory, `${parse(row.exportName).name}.xml`), content, 'utf-8')
  }
}

async function labelMeShape(row: ExportRow, shape: any, groups: GroupConfig[]) {
  const label = groups[categoryIndex(groups, shape.group)]?.label || 'object'
  if (shape.type === 'joint') {
    const sharedFlags = { da_shape_id: shape.id, da_joint: true, da_skeleton: 'coco-person-17' }
    const bones = COCO_PERSON_SKELETON.flatMap(([startIndex, endIndex], boneIndex) => {
      const start = shape.points?.[startIndex]
      const end = shape.points?.[endIndex]
      if (!start?.visibility || !end?.visibility) return []
      return [
        {
          label: `${label}:bone`,
          points: [
            [start.x, start.y],
            [end.x, end.y]
          ],
          group_id: null,
          description: null,
          shape_type: 'linestrip',
          flags: { ...sharedFlags, da_bone_index: boneIndex }
        }
      ]
    })
    const keypoints = COCO_PERSON_KEYPOINTS.flatMap((definition, index) => {
      const point = shape.points?.[index]
      if (!point?.visibility) return []
      return [
        {
          label: `${label}:${definition.name}`,
          points: [[point.x, point.y]],
          group_id: null,
          description: point.visibility === 1 ? 'occluded' : null,
          shape_type: 'point',
          flags: { ...sharedFlags, da_keypoint_index: index, da_visibility: point.visibility }
        }
      ]
    })
    return [...bones, ...keypoints]
  }
  if (shape.type === 'mask') {
    const mask = await renderedMask(row, shape)
    if (!mask) return null
    const [x, y, width, height] = mask.bbox
    return [
      {
        label,
        points: [
          [x, y],
          [x + width - 1, y + height - 1]
        ],
        group_id: null,
        description: null,
        shape_type: 'mask',
        flags: { da_shape_id: shape.id },
        mask: (await maskPng(mask)).toString('base64')
      }
    ]
  }
  if (shape.type === 'rect' && !shape.rotation) {
    return [
      {
        label,
        points: [
          [shape.x - shape.w / 2, shape.y - shape.h / 2],
          [shape.x + shape.w / 2, shape.y + shape.h / 2]
        ],
        group_id: null,
        description: null,
        shape_type: 'rectangle',
        flags: { da_shape_id: shape.id }
      }
    ]
  }
  const points = shapePoints(shape)
  return [
    {
      label,
      points: points.map((point) => [point.x, point.y]),
      group_id: null,
      description: null,
      shape_type:
        shape.type === 'point'
          ? 'point'
          : shape.type === 'polyline' || shape.type === 'curve'
            ? 'linestrip'
            : 'polygon',
      flags: {
        da_shape_id: shape.id,
        ...(shape.type === 'rect' ? { da_rotation: shape.rotation || 0 } : {}),
        ...(shape.type === 'ellipse' ? { da_ellipse: true, da_rotation: shape.rotation || 0 } : {}),
        ...(shape.type === 'curve' ? { da_curve: true, da_control_points: shape.points } : {}),
        ...(shape.type === 'cuboid' ? { da_cuboid: true, da_control_points: shape.points } : {})
      }
    }
  ]
}

async function writeLabelMe(
  directory: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  copyImages(rows, join(directory, 'images'))
  const labelDirectory = join(directory, 'labels')
  mkdirSync(labelDirectory, { recursive: true })
  for (const row of rows) {
    const shapes = (
      await Promise.all(row.parsedShapes.map((shape) => labelMeShape(row, shape, groups)))
    )
      .flat()
      .filter(Boolean)
    writeFileSync(
      join(labelDirectory, `${parse(row.exportName).name}.json`),
      JSON.stringify(
        {
          version: '5.8.1',
          flags: {},
          shapes,
          imagePath: `../images/${row.exportName}`,
          imageData: null,
          imageHeight: row.image_height,
          imageWidth: row.image_width
        },
        null,
        2
      ),
      'utf-8'
    )
  }
}

function safePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '') || 'mask'
}

async function writeMaskPackage(
  directory: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  copyImages(rows, join(directory, 'images'))
  const maskDirectory = join(directory, 'masks')
  mkdirSync(maskDirectory, { recursive: true })
  const annotations: any[] = []
  let id = 1
  for (const row of rows) {
    let sequence = 1
    for (const shape of row.parsedShapes) {
      if (shape.type !== 'mask') continue
      const mask = await renderedMask(row, shape)
      if (!mask) continue
      const categoryId = categoryIndex(groups, shape.group) + 1
      const label = groups[categoryId - 1]?.label || 'mask'
      const filename = `${parse(row.exportName).name}__${categoryId}-${safePart(label)}-${sequence++}.png`
      writeFileSync(join(maskDirectory, filename), await maskPng(mask))
      annotations.push({
        id: id++,
        uuid: shape.id,
        image_id: row.image_id,
        image_name: row.exportName,
        category_id: categoryId,
        bbox: mask.bbox,
        area: mask.area,
        segmentation: cocoRle(mask, row.image_width, row.image_height),
        bitmap: {
          file_name: `masks/${filename}`,
          origin: mask.bbox.slice(0, 2),
          size: [mask.height, mask.width]
        }
      })
    }
  }
  writeFileSync(
    join(directory, 'masks.rle.json'),
    JSON.stringify(
      {
        format: 'coco-rle',
        rle_order: 'column-major',
        images: rows.map((row) => ({
          id: row.image_id,
          file_name: row.exportName,
          width: row.image_width,
          height: row.image_height
        })),
        categories: groups.map((group, index) => ({ id: index + 1, name: group.label })),
        annotations
      },
      null,
      2
    ),
    'utf-8'
  )
}

export async function writeSingleFormat(
  format: ExportFormat,
  filePath: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  if (format === 'json') writeNative(filePath, rows, groups)
  else if (format === 'csv') writeCsv(filePath, rows, groups)
  else if (format === 'coco') await writeCoco(filePath, rows, groups)
  else throw new Error(`Not a single-file format: ${format}`)
}

export async function writeDirectoryFormat(
  format: ExportFormat,
  directory: string,
  rows: ExportRow[],
  groups: GroupConfig[]
): Promise<void> {
  if (format === 'yolo-detect') await writeYoloDetect(directory, rows, groups)
  else if (format === 'yolo-segment') writeYoloSegment(directory, rows, groups)
  else if (format === 'voc') await writeVoc(directory, rows, groups)
  else if (format === 'labelme') await writeLabelMe(directory, rows, groups)
  else if (format === 'mask') await writeMaskPackage(directory, rows, groups)
  else throw new Error(`Not a directory format: ${format}`)
}
