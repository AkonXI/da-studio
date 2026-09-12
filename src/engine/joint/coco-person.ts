import type { JointPoint, JointShape, JointVisibility, Point } from '../model/types'

export const COCO_PERSON_SKELETON_ID = 'coco-person-17' as const

export const COCO_PERSON_KEYPOINTS = [
  { name: 'nose', label: '鼻子' },
  { name: 'left_eye', label: '左眼' },
  { name: 'right_eye', label: '右眼' },
  { name: 'left_ear', label: '左耳' },
  { name: 'right_ear', label: '右耳' },
  { name: 'left_shoulder', label: '左肩' },
  { name: 'right_shoulder', label: '右肩' },
  { name: 'left_elbow', label: '左肘' },
  { name: 'right_elbow', label: '右肘' },
  { name: 'left_wrist', label: '左腕' },
  { name: 'right_wrist', label: '右腕' },
  { name: 'left_hip', label: '左髋' },
  { name: 'right_hip', label: '右髋' },
  { name: 'left_knee', label: '左膝' },
  { name: 'right_knee', label: '右膝' },
  { name: 'left_ankle', label: '左踝' },
  { name: 'right_ankle', label: '右踝' }
] as const

/** COCO person skeleton，内部使用 0-based 索引。 */
export const COCO_PERSON_SKELETON: ReadonlyArray<readonly [number, number]> = [
  [15, 13],
  [13, 11],
  [16, 14],
  [14, 12],
  [11, 12],
  [5, 11],
  [6, 12],
  [5, 6],
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 10],
  [1, 2],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6]
]

export function createCocoPersonPoints(): JointPoint[] {
  return COCO_PERSON_KEYPOINTS.map((definition) => ({
    x: 0,
    y: 0,
    name: definition.name,
    visibility: 0
  }))
}

export function isPlacedJointPoint(point: JointPoint): boolean {
  return point.visibility > 0
}

export function placedJointPoints(shape: JointShape): JointPoint[] {
  return shape.points.filter(isPlacedJointPoint)
}

export function jointPointLabel(index: number): string {
  return COCO_PERSON_KEYPOINTS[index]?.label ?? `关键点 ${index + 1}`
}

export function setJointPoint(
  shape: JointShape,
  index: number,
  point: Point,
  visibility: Exclude<JointVisibility, 0>
): void {
  const target = shape.points[index]
  if (!target) return
  target.x = point.x
  target.y = point.y
  target.visibility = visibility
}

/** 将载入数据规范为固定的 COCO 17 点结构；也可安全读取早期的连续点数组。 */
export function normalizeCocoPersonJoint(shape: JointShape): JointShape {
  const source = Array.isArray(shape.points) ? shape.points : []
  const points = createCocoPersonPoints().map((target, index) => {
    const candidate = source[index] as Partial<JointPoint> | undefined
    if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return target
    const visibility: JointVisibility =
      candidate.visibility === 0 || candidate.visibility === 1 || candidate.visibility === 2
        ? candidate.visibility
        : 2
    return {
      x: Number(candidate.x),
      y: Number(candidate.y),
      name: COCO_PERSON_KEYPOINTS[index].name,
      visibility
    }
  })
  const explicitNext = Number(shape.nextPointIndex)
  const inferredNext = points.findIndex((point) => point.visibility === 0)
  const nextPointIndex = shape.complete
    ? points.length
    : Number.isInteger(explicitNext)
      ? Math.max(0, Math.min(points.length, explicitNext))
      : inferredNext < 0
        ? points.length
        : inferredNext
  return {
    ...shape,
    skeleton: COCO_PERSON_SKELETON_ID,
    points,
    nextPointIndex,
    complete: Boolean(shape.complete || nextPointIndex >= points.length)
  }
}

export function cocoSkeletonForExport(): number[][] {
  return COCO_PERSON_SKELETON.map(([start, end]) => [start + 1, end + 1])
}
