import assert from 'node:assert/strict'
import {
  compressCounts,
  maskCounts,
  maskPng,
  renderMask
} from '../electron/main/export/mask-rle.ts'
import { unionPolygons } from '../src/engine/geometry/polygon-union.ts'
import { pointInNonZeroPolygon } from '../src/engine/geometry/polygon-hit.ts'
import { curvePoints, ellipsePoints, shapeBounds } from '../electron/main/export/geometry.ts'

function decodeCounts(encoded) {
  const counts = []
  let position = 0
  while (position < encoded.length) {
    let value = 0
    let shift = 0
    let character
    do {
      character = encoded.charCodeAt(position++) - 48
      value |= (character & 0x1f) << (5 * shift++)
    } while (character & 0x20)
    if (character & 0x10) value |= -1 << (5 * shift)
    if (counts.length > 2) value += counts[counts.length - 2]
    counts.push(value)
  }
  return counts
}

const rendered = {
  bbox: [1, 1, 2, 2],
  width: 2,
  height: 2,
  pixels: Buffer.from([255, 0, 255, 255]),
  area: 3
}
const counts = maskCounts(rendered, 4, 4)
assert.deepEqual(counts, [5, 2, 3, 1, 5])
assert.deepEqual(decodeCounts(compressCounts(counts)), counts)
assert.equal(
  counts.reduce((sum, count) => sum + count, 0),
  16
)

function bitmap(x, y, width, height, isSet) {
  const pixels = Array.from({ length: width * height }, (_, index) =>
    isSet(index % width, Math.floor(index / width)) ? 1 : 0
  )
  const counts = [0]
  let value = 0
  for (const pixel of pixels) {
    if (pixel === value) counts[counts.length - 1]++
    else {
      counts.push(1)
      value = pixel
    }
  }
  return { x, y, width, height, counts }
}

const rectangleMask = await renderMask(
  {
    type: 'mask',
    bitmap: bitmap(2, 3, 5, 4, (x) => x !== 2)
  },
  20,
  20
)
assert.ok(rectangleMask)
assert.deepEqual(rectangleMask.bbox, [2, 3, 5, 4])
assert.equal(rectangleMask.area, 16)
assert.deepEqual((await maskPng(rectangleMask)).subarray(1, 4), Buffer.from('PNG'))

const rasterized = await renderMask(
  {
    type: 'mask',
    bitmap: bitmap(5, 5, 30, 10, (x, y) => y > 0 && y < 9 && (x < 13 || x > 16))
  },
  100,
  80
)
assert.ok(rasterized)
assert.equal(rasterized.bbox[0], 5)
assert.equal(rasterized.bbox[2], 30)
assert.ok(rasterized.area > 0)

const merged = unionPolygons(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ],
  [
    { x: 5, y: 0 },
    { x: 15, y: 0 },
    { x: 15, y: 10 },
    { x: 5, y: 10 }
  ]
)
assert.ok(merged)
const area = Math.abs(
  merged.reduce((sum, point, index) => {
    const next = merged[(index + 1) % merged.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
)
assert.equal(area, 150)

const selfIntersectingStar = [
  { x: 0, y: -10 },
  { x: 5.878, y: 8.09 },
  { x: -9.511, y: -3.09 },
  { x: 9.511, y: -3.09 },
  { x: -5.878, y: 8.09 }
]
assert.equal(pointInNonZeroPolygon({ x: 0, y: 0 }, selfIntersectingStar), true)
assert.equal(pointInNonZeroPolygon({ x: 20, y: 20 }, selfIntersectingStar), false)

assert.equal(
  unionPolygons(
    [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 }
    ],
    [
      { x: 5, y: 5 },
      { x: 7, y: 5 },
      { x: 7, y: 7 },
      { x: 5, y: 7 }
    ]
  ),
  null
)

const circle = ellipsePoints({ type: 'ellipse', x: 20, y: 30, w: 10, h: 10, rotation: 0 })
assert.equal(circle.length, 48)
assert.deepEqual(
  shapeBounds({ type: 'ellipse', x: 20, y: 30, w: 10, h: 10, rotation: 0 }),
  [15, 25, 10, 10]
)

const curve = curvePoints({
  type: 'curve',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 }
  ]
})
assert.equal(curve.length, 33)
assert.deepEqual(curve[0], { x: 0, y: 0 })
assert.deepEqual(curve[curve.length - 1], { x: 20, y: 0 })

console.log('annotation geometry tests passed')
