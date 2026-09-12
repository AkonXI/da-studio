import type { Point } from '../model/types'

/** 将 Catmull-Rom 控制点转换为可渲染、可导出的折线采样点。 */
export function sampleCurve(points: Point[], segmentsPerSpan = 16): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }))
  const result: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
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
  result.push({ ...points[points.length - 1] })
  return result
}

/** 将椭圆均匀采样为多边形点，兼顾旋转角度。 */
export function sampleEllipse(
  shape: { x: number; y: number; w: number; h: number; rotation?: number },
  count = 48
): Point[] {
  const cos = Math.cos(shape.rotation || 0)
  const sin = Math.sin(shape.rotation || 0)
  const rx = shape.w / 2
  const ry = shape.h / 2
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    const lx = Math.cos(angle) * rx
    const ly = Math.sin(angle) * ry
    return { x: shape.x + lx * cos - ly * sin, y: shape.y + lx * sin + ly * cos }
  })
}
