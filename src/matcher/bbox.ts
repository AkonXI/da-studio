import type { Point } from '../engine/model/types'
import type { BBox, OBB } from './types'

// 轴对齐包围盒 (AABB)：遍历所有点取 x/y 极值
export function computeBBox(points: Point[]): BBox {
  if (points.length === 0) return { xmin: 0, xmax: 0, ymin: 0, ymax: 0 }
  let xmin = Infinity
  let xmax = -Infinity
  let ymin = Infinity
  let ymax = -Infinity
  for (const p of points) {
    if (p.x < xmin) xmin = p.x
    if (p.x > xmax) xmax = p.x
    if (p.y < ymin) ymin = p.y
    if (p.y > ymax) ymax = p.y
  }
  return { xmin, xmax, ymin, ymax }
}

// PCA 定向包围盒 (OBB)：协方差矩阵 → 主方向 → 投影极值
export function computeOBB(points: Point[]): OBB {
  if (points.length < 2) {
    return {
      corners: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ],
      diagonal: 0
    }
  }

  const n = points.length

  // 1. 质心
  let cx = 0,
    cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= n
  cy /= n

  // 2. 2×2 协方差矩阵
  let c11 = 0,
    c12 = 0,
    c22 = 0
  for (const p of points) {
    const dx = p.x - cx,
      dy = p.y - cy
    c11 += dx * dx
    c12 += dx * dy
    c22 += dy * dy
  }

  // 3. 解析求解 2×2 特征值问题
  // λ² - trace·λ + det = 0 → λ = (trace ± √(trace² - 4·det)) / 2
  const trace = c11 + c22
  const det = c11 * c22 - c12 * c12
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det))
  const λ1 = (trace + disc) / 2 // 大特征值
  // const λ2 = (trace - disc) / 2  // 小特征值（不需要）

  // 主特征向量 = 归一化 (c12, λ1 - c11)
  const vx = c12
  const vy = λ1 - c11
  const vlen = Math.hypot(vx, vy) || 1
  const ux = vx / vlen // 主方向
  const uy = vy / vlen

  // 4. 将所有点投影到主方向和法向，取 min/max
  let minP = Infinity,
    maxP = -Infinity
  let minQ = Infinity,
    maxQ = -Infinity
  for (const p of points) {
    const dx = p.x - cx,
      dy = p.y - cy
    const proj = dx * ux + dy * uy // 主方向投影
    const orth = -dx * uy + dy * ux // 法向投影
    if (proj < minP) minP = proj
    if (proj > maxP) maxP = proj
    if (orth < minQ) minQ = orth
    if (orth > maxQ) maxQ = orth
  }

  // 5. 构建 4 个角点（顺时针）：主方向从 minP 到 maxP，法向依次 minQ / maxQ
  const corners: Point[] = [
    { x: cx + minP * ux + minQ * -uy, y: cy + minP * uy + minQ * ux },
    { x: cx + maxP * ux + minQ * -uy, y: cy + maxP * uy + minQ * ux },
    { x: cx + maxP * ux + maxQ * -uy, y: cy + maxP * uy + maxQ * ux },
    { x: cx + minP * ux + maxQ * -uy, y: cy + minP * uy + maxQ * ux }
  ]

  const diag = Math.hypot(maxP - minP, maxQ - minQ)

  return { corners, diagonal: diag }
}
