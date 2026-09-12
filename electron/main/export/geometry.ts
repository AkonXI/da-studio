import type { Point } from './types'

export function rectPoints(shape: any): Point[] {
  const halfWidth = Number(shape.w || 0) / 2
  const halfHeight = Number(shape.h || 0) / 2
  const rotation = Number(shape.rotation || 0)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight]
  ].map(([x, y]) => ({
    x: Number(shape.x || 0) + x * cos - y * sin,
    y: Number(shape.y || 0) + x * sin + y * cos
  }))
}

export function ellipsePoints(shape: any, count = 48): Point[] {
  const rotation = Number(shape.rotation || 0)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const radiusX = Number(shape.w || 0) / 2
  const radiusY = Number(shape.h || 0) / 2
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    const x = Math.cos(angle) * radiusX
    const y = Math.sin(angle) * radiusY
    return {
      x: Number(shape.x || 0) + x * cos - y * sin,
      y: Number(shape.y || 0) + x * sin + y * cos
    }
  })
}

export function curvePoints(shape: any, segmentsPerSpan = 16): Point[] {
  const points: Point[] = Array.isArray(shape.points)
    ? shape.points.map((point: any) => ({ x: Number(point.x || 0), y: Number(point.y || 0) }))
    : []
  if (points.length < 2) return points
  const result: Point[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[Math.min(points.length - 1, index + 2)]
    for (let step = 0; step < segmentsPerSpan; step++) {
      const t = step / segmentsPerSpan
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      })
    }
  }
  result.push(points[points.length - 1])
  return result
}

export function cuboidCorners(shape: any): Point[] {
  const points = Array.isArray(shape.points) ? shape.points : []
  if (points.length >= 8) return points.slice(0, 8)
  if (points.length < 2) return points
  const start = points[0]
  const end = points[1]
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  const depth = Math.min(right - left, bottom - top) * 0.22
  const front = [
    { x: left + depth, y: top + depth },
    { x: right, y: top + depth },
    { x: right, y: bottom },
    { x: left + depth, y: bottom }
  ]
  const back = [
    { x: left, y: top },
    { x: right - depth, y: top },
    { x: right - depth, y: bottom - depth },
    { x: left, y: bottom - depth }
  ]
  return [...front, ...back]
}

export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 2) return sorted
  const cross = (origin: Point, a: Point, b: Point) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
  const lower: Point[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
      lower.pop()
    lower.push(point)
  }
  const upper: Point[] = []
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
      upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function shapePoints(shape: any): Point[] {
  if (shape.type === 'rect') return rectPoints(shape)
  if (shape.type === 'ellipse') return ellipsePoints(shape)
  if (shape.type === 'curve') return curvePoints(shape)
  if (shape.type === 'point') return [{ x: Number(shape.x || 0), y: Number(shape.y || 0) }]
  if (shape.type === 'cuboid') return convexHull(cuboidCorners(shape))
  if (shape.type === 'joint') {
    return Array.isArray(shape.points)
      ? shape.points
          .filter((point: any) => Number(point.visibility || 0) > 0)
          .map((point: any) => ({ x: Number(point.x || 0), y: Number(point.y || 0) }))
      : []
  }
  return Array.isArray(shape.points)
    ? shape.points.map((point: any) => ({ x: Number(point.x || 0), y: Number(point.y || 0) }))
    : []
}

export function shapeBounds(shape: any): [number, number, number, number] {
  const points = shapePoints(shape)
  if (points.length === 0) return [0, 0, 0, 0]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  let minX = Math.min(...xs)
  let minY = Math.min(...ys)
  let maxX = Math.max(...xs)
  let maxY = Math.max(...ys)
  if (shape.type === 'point') {
    minX -= 1
    minY -= 1
    maxX += 1
    maxY += 1
  }
  return [minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY)]
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(area) / 2
}
