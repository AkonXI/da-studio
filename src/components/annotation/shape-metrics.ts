import { maskBitmapRegionCount } from '../../engine/mask/bitmap'
import type { MaskShape, Point } from '../../engine/model/types'

export interface MaskDisplayStats {
  regions: number
  bounds: { x: number; y: number; w: number; h: number } | null
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let twiceArea = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    twiceArea += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(twiceArea) / 2
}

export function cuboidVolume(points: Point[]): number {
  if (points.length < 8) return 0
  const averageLength = (pairs: [number, number][]) =>
    pairs.reduce(
      (sum, [start, end]) =>
        sum + Math.hypot(points[end].x - points[start].x, points[end].y - points[start].y),
      0
    ) / pairs.length
  const width = averageLength([[0, 1], [3, 2], [4, 5], [7, 6]])
  const height = averageLength([[0, 3], [1, 2], [4, 7], [5, 6]])
  const depth = averageLength([[0, 4], [1, 5], [2, 6], [3, 7]])
  return width * height * depth
}

export function formatMeasure(value: number): string {
  return value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(1)
}

export function computeMaskStats(shape: MaskShape): MaskDisplayStats {
  const bitmap = shape.bitmap
  if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) return { regions: 0, bounds: null }
  return {
    regions: maskBitmapRegionCount(bitmap),
    bounds: { x: bitmap.x, y: bitmap.y, w: bitmap.width, h: bitmap.height }
  }
}

export function formatMaskBounds(bounds: MaskDisplayStats['bounds']): string {
  return bounds
    ? `(${bounds.x.toFixed(0)}, ${bounds.y.toFixed(0)}, ${bounds.w.toFixed(0)}, ${bounds.h.toFixed(0)})`
    : '-'
}
