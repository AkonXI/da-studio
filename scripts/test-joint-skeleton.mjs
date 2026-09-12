import assert from 'node:assert/strict'
import {
  COCO_PERSON_KEYPOINTS,
  COCO_PERSON_SKELETON,
  cocoSkeletonForExport,
  createCocoPersonPoints,
  normalizeCocoPersonJoint,
  placedJointPoints,
  setJointPoint
} from '../src/engine/joint/coco-person.ts'

const points = createCocoPersonPoints()
assert.equal(points.length, 17)
assert.equal(
  points.every((point) => point.visibility === 0),
  true
)
assert.equal(new Set(points.map((point) => point.name)).size, 17)

for (const [start, end] of COCO_PERSON_SKELETON) {
  assert.equal(start >= 0 && start < COCO_PERSON_KEYPOINTS.length, true)
  assert.equal(end >= 0 && end < COCO_PERSON_KEYPOINTS.length, true)
  assert.notEqual(start, end)
}
assert.deepEqual(cocoSkeletonForExport()[0], [16, 14])

const shape = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'joint',
  skeleton: 'coco-person-17',
  points,
  nextPointIndex: 0,
  complete: false,
  group: 'red'
}
setJointPoint(shape, 0, { x: 12, y: 34 }, 2)
setJointPoint(shape, 5, { x: 56, y: 78 }, 1)
assert.equal(placedJointPoints(shape).length, 2)
assert.deepEqual(shape.points[0], { x: 12, y: 34, name: 'nose', visibility: 2 })

const normalized = normalizeCocoPersonJoint({
  ...shape,
  points: [
    { x: 1, y: 2 },
    { x: 3, y: 4 }
  ],
  nextPointIndex: undefined,
  skeleton: undefined
})
assert.equal(normalized.points.length, 17)
assert.equal(normalized.points[0].visibility, 2)
assert.equal(normalized.points[2].visibility, 0)
assert.equal(normalized.nextPointIndex, 2)

console.log('joint skeleton tests passed')
