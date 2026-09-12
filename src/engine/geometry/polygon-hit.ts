import type { Point } from '../model/types'

const EPSILON = 1e-7

/**
 * 使用 Canvas 默认的 nonzero winding rule 判断点是否位于多边形填充区域。
 * 与奇偶射线法不同，该规则能正确覆盖自交多边形中被同向路径重复环绕的区域。
 */
export function pointInNonZeroPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false

  let windingNumber = 0
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const cross = (end.x - start.x) * (point.y - start.y) - (point.x - start.x) * (end.y - start.y)
    const onSegment =
      Math.abs(cross) <= EPSILON &&
      point.x >= Math.min(start.x, end.x) - EPSILON &&
      point.x <= Math.max(start.x, end.x) + EPSILON &&
      point.y >= Math.min(start.y, end.y) - EPSILON &&
      point.y <= Math.max(start.y, end.y) + EPSILON

    if (onSegment) return true

    if (start.y <= point.y) {
      if (end.y > point.y && cross > EPSILON) windingNumber++
    } else if (end.y <= point.y && cross < -EPSILON) {
      windingNumber--
    }
  }

  return windingNumber !== 0
}
