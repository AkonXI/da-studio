export type ExportFormat =
  | 'json'
  | 'csv'
  | 'coco'
  | 'yolo-detect'
  | 'yolo-segment'
  | 'voc'
  | 'labelme'
  | 'mask'

export interface Point {
  x: number
  y: number
}

export interface GroupConfig {
  id: string
  name: string
  label: string
}

export interface ExportRow {
  image_id: number
  image_md5: string
  image_name: string
  image_filename: string
  image_width: number
  image_height: number
  parsedShapes: any[]
  meta: any
  exportName: string
}

export interface RenderedMask {
  bbox: [number, number, number, number]
  width: number
  height: number
  pixels: Buffer
  area: number
}
