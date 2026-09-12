import type { Point } from '../engine/model/types'
import type { MatchResult, MatcherOptions } from './types'
import { resample } from './resample'
import { computeBBox, computeOBB } from './bbox'
import { dist2 } from './geometry'

// 核心比对算法：单向 Hausdorff 距离控"飞出去"，邻域占比控"贴合度"
export function matchTrajectory(
  curveA: Point[],
  curveB: Point[],
  options: MatcherOptions = {}
): MatchResult {
  const spacing = options.spacing ?? 2
  const delta = options.delta ?? 3
  const pct = options.pct ?? 0.01
  const closed = options.closed ?? false

  // 等距重采样，消除原始点密度差异
  const rA = resample(curveA, spacing, closed)
  const rB = resample(curveB, spacing, closed)

  // OBB 定向包围盒 → 对角线 D → 动态阈值 E_max = max(pct×D, 3)
  const bbox = computeBBox(rA)
  const obb = computeOBB(rA)
  const D = obb.diagonal
  const eMax = Math.max(pct * D, 3)

  // 单趟同时计算：最大误差 h(B,A) + 相似度 (B 弧长合规占比)
  const eMax2 = eMax * eMax
  let maxError = 0
  const violations: Point[] = []
  let compliantCount = 0

  for (const bp of rB) {
    let minD2 = Infinity
    // 对 B 每个点，全局搜索 A 中最近邻居距离
    for (const ap of rA) {
      const d2 = dist2(bp, ap)
      if (d2 < minD2) minD2 = d2
    }
    if (minD2 <= eMax2) compliantCount++ // 该点落在 A 的 E_max 管状邻域内
    const actual = Math.sqrt(minD2)
    if (actual > maxError) maxError = actual // h(B,A) = 所有最近距离中的最大值
    if (actual > eMax) violations.push({ x: bp.x, y: bp.y })
  }
  const similarity = compliantCount / rB.length

  // 重合率：A 每个点是否被 B 的 δ=3px 邻域覆盖，仅作参考不参与 PASS/FAIL
  const delta2 = delta * delta
  let covered = 0
  for (const ap of rA) {
    for (const bp of rB) {
      if (dist2(ap, bp) <= delta2) {
        covered++
        break
      }
    }
  }
  const coverage = covered / rA.length

  return {
    resampledA: rA,
    resampledB: rB,
    bbox,
    diagonal: D,
    eMax,
    delta,
    maxError,
    violations,
    coverage,
    similarity,
    obb,
    // PASS 条件：无违规点 且 相似度 ≥ 90%
    maxErrorPass: violations.length === 0,
    similarityPass: similarity >= 0.9
  }
}
