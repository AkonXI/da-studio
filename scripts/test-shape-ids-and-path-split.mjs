import assert from 'node:assert/strict'
import { validate as validateUuid } from 'uuid'
import { splitPolygonWithPath, splitPolylineAtCuts } from '../src/engine/geometry/path-split.ts'
import { createShapeId, ensureShapeIds } from '../src/engine/shared/utils.ts'
import {
  decodeMaskBitmap,
  encodeMaskPixels,
  maskBitmapRegionCount,
  mergeMaskBitmaps
} from '../src/engine/mask/bitmap.ts'

function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(area) / 2
}

function pathLength(points) {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    )
  }
  return length
}

const stableId = createShapeId()
const normalized = ensureShapeIds([
  { id: stableId, type: 'point', x: 0, y: 0, group: 'red' },
  { id: stableId, type: 'point', x: 1, y: 1, group: 'red' },
  { type: 'point', x: 2, y: 2, group: 'red' }
])
assert.equal(normalized[0].id, stableId)
assert.equal(new Set(normalized.map((shape) => shape.id)).size, 3)
assert.ok(normalized.every((shape) => validateUuid(shape.id)))

const polygonPoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
]
const polygonStart = { edgeIdx: 3, ratio: 0.5, point: { x: 0, y: 5 } }
const polygonEnd = { edgeIdx: 1, ratio: 0.5, point: { x: 10, y: 5 } }
const polygonParts = splitPolygonWithPath(polygonPoints, polygonStart, polygonEnd, [
  polygonStart.point,
  { x: 5, y: 2 },
  polygonEnd.point
])
assert.equal(polygonParts.length, 2)
assert.ok(polygonParts.some((part) => part.some((point) => point.x === 5 && point.y === 2)))
assert.ok(Math.abs(polygonParts.reduce((sum, part) => sum + polygonArea(part), 0) - 100) < 1e-6)
const sharedCoordinate = polygonParts[0].find((left) =>
  polygonParts[1].some((right) => right.x === left.x && right.y === left.y)
)
assert.ok(sharedCoordinate)
const matchingOther = polygonParts[1].find(
  (point) => point.x === sharedCoordinate.x && point.y === sharedCoordinate.y
)
assert.notEqual(sharedCoordinate, matchingOther, 'split shapes must not share mutable point objects')

const selfIntersectingParts = splitPolygonWithPath(polygonPoints, polygonStart, polygonEnd, [
  polygonStart.point,
  { x: 8, y: 2 },
  { x: 2, y: 8 },
  { x: 8, y: 8 },
  { x: 2, y: 2 },
  polygonEnd.point
])
assert.ok(selfIntersectingParts.length > 2)
assert.ok(
  Math.abs(selfIntersectingParts.reduce((sum, part) => sum + polygonArea(part), 0) - 100) < 1e-6
)

const polylinePoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 20, y: 0 },
  { x: 30, y: 0 }
]
const polylineParts = splitPolylineAtCuts(
  polylinePoints,
  { edgeIdx: 0, ratio: 0.5, point: { x: 5, y: 0 } },
  { edgeIdx: 2, ratio: 0.5, point: { x: 25, y: 0 } }
)
assert.equal(polylineParts.length, 3)
assert.ok(Math.abs(polylineParts.reduce((sum, part) => sum + pathLength(part), 0) - 30) < 1e-6)

const firstMask = { x: 2, y: 3, width: 2, height: 2, counts: encodeMaskPixels([1, 1, 1, 1]) }
const secondMask = { x: 6, y: 3, width: 2, height: 2, counts: encodeMaskPixels([1, 1, 1, 1]) }
const mergedMask = mergeMaskBitmaps([firstMask, secondMask])
assert.deepEqual(
  { x: mergedMask.x, y: mergedMask.y, width: mergedMask.width, height: mergedMask.height },
  { x: 2, y: 3, width: 6, height: 2 }
)
assert.equal(decodeMaskBitmap(mergedMask).reduce((sum, pixel) => sum + pixel, 0), 8)
assert.equal(maskBitmapRegionCount(mergedMask), 2)

console.log('shape id and path split tests passed')
