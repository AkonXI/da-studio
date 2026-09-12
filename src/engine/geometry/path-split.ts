import type { Point } from '../model/types'

export interface PathCut {
  edgeIdx: number
  ratio: number
  point: Point
}

interface AugmentedPoint {
  point: Point
  marker?: 'start' | 'end'
}

function withoutAdjacentDuplicates(points: Point[]): Point[] {
  const result = points.filter(
    (point, index) =>
      index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-6
  )
  if (
    result.length > 1 &&
    Math.hypot(
      result[0].x - result[result.length - 1].x,
      result[0].y - result[result.length - 1].y
    ) <= 1e-6
  ) {
    result.pop()
  }
  return result
}

function detached(points: Point[]): Point[] {
  return points.map((point) => ({ x: point.x, y: point.y }))
}

function pathLength(points: Point[]): number {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    )
  }
  return length
}

function polygonArea(points: Point[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(area) / 2
}

function signedPolygonArea(points: Point[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return area / 2
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

interface Segment {
  a: Point
  b: Point
}

function segmentIntersection(left: Segment, right: Segment): { point: Point; t: number; u: number } | null {
  const rx = left.b.x - left.a.x
  const ry = left.b.y - left.a.y
  const sx = right.b.x - right.a.x
  const sy = right.b.y - right.a.y
  const cross = rx * sy - ry * sx
  if (Math.abs(cross) <= 1e-9) return null
  const qpx = right.a.x - left.a.x
  const qpy = right.a.y - left.a.y
  const t = (qpx * sy - qpy * sx) / cross
  const u = (qpx * ry - qpy * rx) / cross
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return {
    point: { x: left.a.x + rx * t, y: left.a.y + ry * t },
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u))
  }
}

/**
 * 将边界与裁剪折线构造成平面图并提取内部面。与直接首尾拼接不同，
 * 这里会先把折线自交点拆成图节点，因此一次裁剪可以稳定地产生两个以上区域。
 */
function polygonFacesFromCut(boundary: Point[], cutPath: Point[]): Point[][] {
  const cleanBoundary = withoutAdjacentDuplicates(boundary)
  const cleanCut = withoutAdjacentDuplicates(cutPath)
  if (cleanBoundary.length < 3 || cleanCut.length < 2) return []

  const segments: Segment[] = []
  for (let i = 0; i < cleanBoundary.length; i++) {
    segments.push({ a: cleanBoundary[i], b: cleanBoundary[(i + 1) % cleanBoundary.length] })
  }
  for (let i = 1; i < cleanCut.length; i++) {
    segments.push({ a: cleanCut[i - 1], b: cleanCut[i] })
  }

  const splitAt = segments.map(() => [0, 1])
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const hit = segmentIntersection(segments[i], segments[j])
      if (!hit) continue
      splitAt[i].push(hit.t)
      splitAt[j].push(hit.u)
    }
  }

  const vertices: Point[] = []
  const vertexKey = (point: Point) => `${Math.round(point.x * 1e7)},${Math.round(point.y * 1e7)}`
  const vertexMap = new Map<string, number>()
  const getVertex = (point: Point): number => {
    const key = vertexKey(point)
    const found = vertexMap.get(key)
    if (found !== undefined) return found
    const index = vertices.length
    vertices.push(point)
    vertexMap.set(key, index)
    return index
  }
  const adjacency = new Map<number, Set<number>>()
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    if (!adjacency.has(a)) adjacency.set(a, new Set())
    if (!adjacency.has(b)) adjacency.set(b, new Set())
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }

  segments.forEach((segment, index) => {
    const values = [...new Set(splitAt[index].map((value) => Math.round(value * 1e9) / 1e9))].sort(
      (a, b) => a - b
    )
    for (let i = 1; i < values.length; i++) {
      const at = (t: number): Point => ({
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t
      })
      addEdge(getVertex(at(values[i - 1])), getVertex(at(values[i])))
    }
  })

  const ordered = new Map<number, number[]>()
  adjacency.forEach((neighbors, vertex) => {
    ordered.set(
      vertex,
      [...neighbors].sort(
        (a, b) =>
          Math.atan2(vertices[a].y - vertices[vertex].y, vertices[a].x - vertices[vertex].x) -
          Math.atan2(vertices[b].y - vertices[vertex].y, vertices[b].x - vertices[vertex].x)
      )
    )
  })

  const visited = new Set<string>()
  const faces: Point[][] = []
  ordered.forEach((neighbors, start) => {
    for (const firstNext of neighbors) {
      const initialKey = `${start}:${firstNext}`
      if (visited.has(initialKey)) continue
      const indices: number[] = []
      let from = start
      let to = firstNext
      for (let guard = 0; guard < segments.length * segments.length * 4 + 32; guard++) {
        const key = `${from}:${to}`
        if (visited.has(key)) break
        visited.add(key)
        indices.push(from)
        const around = ordered.get(to)
        if (!around?.length) break
        const reverseIndex = around.indexOf(from)
        if (reverseIndex < 0) break
        const next = around[(reverseIndex - 1 + around.length) % around.length]
        from = to
        to = next
        if (from === start && to === firstNext) {
          const face = withoutAdjacentDuplicates(indices.map((index) => vertices[index]))
          const area = signedPolygonArea(face)
          if (face.length >= 3 && area > 1e-6) {
            const a = face[0]
            const b = face[1]
            const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
            const sample = {
              x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * 1e-5,
              y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * 1e-5
            }
            if (pointInPolygon(sample, cleanBoundary)) faces.push(face)
          }
          break
        }
      }
    }
  })
  return faces
}

function augment(points: Point[], start: PathCut, end: PathCut): AugmentedPoint[] {
  const cuts = [
    { ...start, marker: 'start' as const },
    { ...end, marker: 'end' as const }
  ]
  const result: AugmentedPoint[] = []
  for (let index = 0; index < points.length; index++) {
    result.push({ point: points[index] })
    cuts
      .filter((cut) => cut.edgeIdx === index)
      .sort((left, right) => left.ratio - right.ratio)
      .forEach((cut) => result.push({ point: cut.point, marker: cut.marker }))
  }
  return result
}

/** 沿两个切点将一条折线拆为所有有效片段。 */
export function splitPolylineAtCuts(points: Point[], start: PathCut, end: PathCut): Point[][] {
  const augmented = augment(points, start, end)
  const startIndex = augmented.findIndex((entry) => entry.marker === 'start')
  const endIndex = augmented.findIndex((entry) => entry.marker === 'end')
  if (startIndex < 0 || endIndex < 0) return []
  const [first, second] = [startIndex, endIndex].sort((left, right) => left - right)
  return [
    augmented.slice(0, first + 1).map((entry) => entry.point),
    augmented.slice(first, second + 1).map((entry) => entry.point),
    augmented.slice(second).map((entry) => entry.point)
  ]
    .map(withoutAdjacentDuplicates)
    .filter((part) => part.length >= 2 && pathLength(part) > 1e-6)
    .map(detached)
}

/** 用一条位于多边形内部的折线路径将其拆成两个完整区域。 */
export function splitPolygonWithPath(
  points: Point[],
  start: PathCut,
  end: PathCut,
  cutPath: Point[]
): Point[][] {
  const augmented = augment(points, start, end)
  const startIndex = augmented.findIndex((entry) => entry.marker === 'start')
  const endIndex = augmented.findIndex((entry) => entry.marker === 'end')
  if (startIndex < 0 || endIndex < 0) return []

  const forward = (from: number, to: number): Point[] => {
    const path: Point[] = []
    let index = from
    for (let guard = 0; guard <= augmented.length; guard++) {
      path.push(augmented[index].point)
      if (index === to) break
      index = (index + 1) % augmented.length
    }
    return path
  }
  const normalizedCutPath = [
    augmented[startIndex].point,
    ...cutPath.slice(1, -1),
    augmented[endIndex].point
  ]
  const faces = polygonFacesFromCut(points, normalizedCutPath)
  if (faces.length >= 2) return faces.map(detached)

  // 对无自交的极简路径保留直接拼接兜底。
  const interior = normalizedCutPath.slice(1, -1)
  return [
    [...forward(startIndex, endIndex), ...interior.slice().reverse()],
    [...forward(endIndex, startIndex), ...interior]
  ]
    .map(withoutAdjacentDuplicates)
    .filter((part) => part.length >= 3 && polygonArea(part) > 1e-6)
    .map(detached)
}
