import type { Point } from '../engine/model/types'

// 欧氏距离平方，避免 sqrt 开销，仅在比较时使用
export function dist2(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

// 欧氏距离 = 以两点为对角顶点的矩形斜边长
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
