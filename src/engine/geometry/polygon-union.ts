import type { Point } from '../model/types'

const EPSILON = 1e-6

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON
}

function signedArea(points: Point[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return area / 2
}

function normalized(points: Point[]): Point[] {
  const result = points.map((point) => ({ ...point }))
  return signedArea(result) < 0 ? result.reverse() : result
}

/** -1 表示边界，0 表示外部，1 表示内部。 */
export function pointInPolygon(point: Point, polygon: Point[]): -1 | 0 | 1 {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous]
    const b = polygon[index]
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
    const onSegment =
      Math.abs(cross) <= EPSILON &&
      point.x >= Math.min(a.x, b.x) - EPSILON &&
      point.x <= Math.max(a.x, b.x) + EPSILON &&
      point.y >= Math.min(a.y, b.y) - EPSILON &&
      point.y <= Math.max(a.y, b.y) + EPSILON
    if (onSegment) return -1

    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside ? 1 : 0
}

interface Intersection {
  point: Point
  aEdge: number
  bEdge: number
  aRatio: number
  bRatio: number
}

function segmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): { point: Point; aRatio: number; bRatio: number } | null {
  const abX = b.x - a.x
  const abY = b.y - a.y
  const cdX = d.x - c.x
  const cdY = d.y - c.y
  const denominator = abX * cdY - abY * cdX
  if (Math.abs(denominator) <= EPSILON) return null

  const acX = c.x - a.x
  const acY = c.y - a.y
  const aRatio = (acX * cdY - acY * cdX) / denominator
  const bRatio = (acX * abY - acY * abX) / denominator
  if (aRatio < -EPSILON || aRatio > 1 + EPSILON || bRatio < -EPSILON || bRatio > 1 + EPSILON) {
    return null
  }
  return {
    point: { x: a.x + abX * aRatio, y: a.y + abY * aRatio },
    aRatio: Math.max(0, Math.min(1, aRatio)),
    bRatio: Math.max(0, Math.min(1, bRatio))
  }
}

function intersectionsOf(a: Point[], b: Point[]): Intersection[] {
  const intersections: Intersection[] = []
  for (let aEdge = 0; aEdge < a.length; aEdge++) {
    for (let bEdge = 0; bEdge < b.length; bEdge++) {
      const hit = segmentIntersection(
        a[aEdge],
        a[(aEdge + 1) % a.length],
        b[bEdge],
        b[(bEdge + 1) % b.length]
      )
      if (!hit) continue
      if (
        intersections.some(
          (existing) =>
            existing.aEdge === aEdge &&
            existing.bEdge === bEdge &&
            samePoint(existing.point, hit.point)
        )
      ) {
        continue
      }
      intersections.push({ ...hit, aEdge, bEdge })
    }
  }
  return intersections
}

interface Segment {
  start: Point
  end: Point
}

function exteriorSegments(
  polygon: Point[],
  other: Point[],
  intersections: Intersection[],
  source: 'a' | 'b'
): Segment[] {
  const result: Segment[] = []
  for (let edge = 0; edge < polygon.length; edge++) {
    const start = polygon[edge]
    const end = polygon[(edge + 1) % polygon.length]
    const cuts = [
      { ratio: 0, point: start },
      ...intersections
        .filter((hit) => (source === 'a' ? hit.aEdge : hit.bEdge) === edge)
        .map((hit) => ({
          ratio: source === 'a' ? hit.aRatio : hit.bRatio,
          point: hit.point
        })),
      { ratio: 1, point: end }
    ].sort((left, right) => left.ratio - right.ratio)

    const unique = cuts.filter(
      (cut, index) => index === 0 || !samePoint(cut.point, cuts[index - 1].point)
    )
    for (let index = 0; index < unique.length - 1; index++) {
      const first = unique[index].point
      const second = unique[index + 1].point
      if (samePoint(first, second)) continue
      const middle = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      if (pointInPolygon(middle, other) !== 1) result.push({ start: first, end: second })
    }
  }
  return result
}

function removeDuplicateSegments(segments: Segment[]): Segment[] {
  const result: Segment[] = []
  for (const segment of segments) {
    if (
      result.some(
        (existing) =>
          (samePoint(existing.start, segment.start) && samePoint(existing.end, segment.end)) ||
          (samePoint(existing.start, segment.end) && samePoint(existing.end, segment.start))
      )
    ) {
      continue
    }
    result.push(segment)
  }
  return result
}

function simplify(points: Point[]): Point[] {
  const unique = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1])
  )
  if (unique.length > 1 && samePoint(unique[0], unique[unique.length - 1])) unique.pop()

  let changed = true
  while (changed && unique.length > 3) {
    changed = false
    for (let index = 0; index < unique.length; index++) {
      const previous = unique[(index - 1 + unique.length) % unique.length]
      const current = unique[index]
      const next = unique[(index + 1) % unique.length]
      const cross =
        (current.x - previous.x) * (next.y - current.y) -
        (current.y - previous.y) * (next.x - current.x)
      if (Math.abs(cross) <= EPSILON) {
        unique.splice(index, 1)
        changed = true
        break
      }
    }
  }
  return unique
}

function traceLoops(input: Segment[]): Point[][] {
  const remaining = input.slice()
  const loops: Point[][] = []
  while (remaining.length) {
    const first = remaining.shift()!
    const loop = [first.start, first.end]
    let cursor = first.end
    let guard = input.length + 2
    while (!samePoint(cursor, loop[0]) && guard-- > 0) {
      let nextIndex = remaining.findIndex((segment) => samePoint(segment.start, cursor))
      let reverse = false
      if (nextIndex < 0) {
        nextIndex = remaining.findIndex((segment) => samePoint(segment.end, cursor))
        reverse = nextIndex >= 0
      }
      if (nextIndex < 0) break
      const next = remaining.splice(nextIndex, 1)[0]
      cursor = reverse ? next.start : next.end
      loop.push(cursor)
    }
    if (samePoint(cursor, loop[0])) {
      const simplified = simplify(loop)
      if (simplified.length >= 3) loops.push(simplified)
    }
  }
  return loops
}

/**
 * 合并两个相交或包含的简单多边形。分离的多边形无法由单个 PolygonShape 表达，返回 null。
 */
export function unionPolygons(first: Point[], second: Point[]): Point[] | null {
  if (first.length < 3 || second.length < 3) return null
  const a = normalized(first)
  const b = normalized(second)
  const intersections = intersectionsOf(a, b)

  if (intersections.length === 0) {
    const aInside = a.some((point) => pointInPolygon(point, b) === 1)
    const bInside = b.some((point) => pointInPolygon(point, a) === 1)
    if (aInside) return b
    if (bInside) return a
    const identicalBoundary = a.every((point) => pointInPolygon(point, b) === -1)
    return identicalBoundary ? (Math.abs(signedArea(a)) >= Math.abs(signedArea(b)) ? a : b) : null
  }

  const segments = removeDuplicateSegments([
    ...exteriorSegments(a, b, intersections, 'a'),
    ...exteriorSegments(b, a, intersections, 'b')
  ])
  const loops = traceLoops(segments)
  if (!loops.length) return null
  loops.sort((left, right) => Math.abs(signedArea(right)) - Math.abs(signedArea(left)))
  return normalized(loops[0])
}
