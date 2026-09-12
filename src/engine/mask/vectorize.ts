import { decodeMaskBitmap } from './bitmap'
import type { MaskBitmap, Point } from '../model/types'

function key(x: number, y: number): string {
  return `${x},${y}`
}

function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points
  const distanceToSegment = (point: Point, start: Point, end: Point) => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = dx * dx + dy * dy
    const ratio = length
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length))
      : 0
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
  }
  const open = [...points, points[0]]
  const keep = new Uint8Array(open.length)
  keep[0] = keep[open.length - 1] = 1
  const stack: [number, number][] = [[0, open.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDistance = tolerance
    let split = -1
    for (let index = start + 1; index < end; index++) {
      const distance = distanceToSegment(open[index], open[start], open[end])
      if (distance > maxDistance) {
        maxDistance = distance
        split = index
      }
    }
    if (split >= 0) {
      keep[split] = 1
      stack.push([start, split], [split, end])
    }
  }
  return open.filter((_point, index) => keep[index] && index < open.length - 1)
}

/** 将每个 4-连通 Mask 区域转换为一个外轮廓，多区域不会被合并。 */
export function maskBitmapToPolygons(bitmap: MaskBitmap, tolerance = 1.5): Point[][] {
  const pixels = decodeMaskBitmap(bitmap)
  const visited = new Uint8Array(pixels.length)
  const polygons: Point[][] = []
  for (let seed = 0; seed < pixels.length; seed++) {
    if (!pixels[seed] || visited[seed]) continue
    const component = new Set<number>()
    const queue = [seed]
    visited[seed] = 1
    while (queue.length > 0) {
      const current = queue.pop()!
      component.add(current)
      const x = current % bitmap.width
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < bitmap.width ? current + 1 : -1,
        current >= bitmap.width ? current - bitmap.width : -1,
        current + bitmap.width < pixels.length ? current + bitmap.width : -1
      ]
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && pixels[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1
          queue.push(neighbor)
        }
      })
    }

    const edges = new Map<string, Point[]>()
    const addEdge = (start: Point, end: Point) => {
      const bucket = edges.get(key(start.x, start.y)) || []
      bucket.push(end)
      edges.set(key(start.x, start.y), bucket)
    }
    component.forEach((index) => {
      const x = index % bitmap.width
      const y = Math.floor(index / bitmap.width)
      if (!component.has(index - bitmap.width)) addEdge({ x, y }, { x: x + 1, y })
      if (x + 1 === bitmap.width || !component.has(index + 1)) addEdge({ x: x + 1, y }, { x: x + 1, y: y + 1 })
      if (!component.has(index + bitmap.width)) addEdge({ x: x + 1, y: y + 1 }, { x, y: y + 1 })
      if (x === 0 || !component.has(index - 1)) addEdge({ x, y: y + 1 }, { x, y })
    })

    const loops: Point[][] = []
    while (edges.size > 0) {
      const firstKey = edges.keys().next().value as string
      const [firstX, firstY] = firstKey.split(',').map(Number)
      const loop: Point[] = [{ x: firstX, y: firstY }]
      let cursor = loop[0]
      for (let guard = 0; guard <= component.size * 4 + 4; guard++) {
        const bucketKey = key(cursor.x, cursor.y)
        const bucket = edges.get(bucketKey)
        if (!bucket?.length) break
        const next = bucket.pop()!
        if (bucket.length === 0) edges.delete(bucketKey)
        if (next.x === loop[0].x && next.y === loop[0].y) break
        loop.push(next)
        cursor = next
      }
      if (loop.length >= 3) loops.push(loop)
    }
    const outer = loops.sort((left, right) => right.length - left.length)[0]
    if (!outer) continue
    const reduced = simplify(outer, tolerance).map((point) => ({
      x: point.x + bitmap.x,
      y: point.y + bitmap.y
    }))
    if (reduced.length >= 3) polygons.push(reduced)
  }
  return polygons
}
