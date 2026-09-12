import type { Point } from '../engine/model/types'
import { dist } from './geometry'

// 弧长等距重采样：沿折线路径每 spacing 像素放置一个点，消除鼠标速度不均导致密度差异
// closed=true 时闭合段也参与采样，适用于多边形/矩形
export function resample(points: Point[], spacing: number, closed = false): Point[] {
  if (points.length < 2) {
    return points.length === 0 ? [] : [{ x: points[0].x, y: points[0].y }]
  }

  const n = points.length
  // 预计算所有段（含可能的闭合段），段数 = 闭合时 n，开放时 n-1
  const segCount = closed ? n : n - 1
  const segStart: Point[] = []
  const segEnd: Point[] = []
  const segLens: number[] = []

  for (let i = 0; i < segCount; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    segStart.push(a)
    segEnd.push(b)
    segLens.push(dist(a, b))
  }

  const cumDist: number[] = [0]
  for (let i = 0; i < segLens.length; i++) {
    cumDist.push(cumDist[i] + segLens[i])
  }

  const totalLen = cumDist[cumDist.length - 1]
  if (totalLen < 0.001) return [{ x: points[0].x, y: points[0].y }]

  const result: Point[] = []
  let segIdx = 0

  // d = 当前累积弧长，沿路径递增，每 spacing 插一个点
  for (let d = 0; d <= totalLen + 1e-9; d += spacing) {
    while (segIdx < segCount - 1 && cumDist[segIdx + 1] < d - 1e-9) segIdx++
    if (segIdx >= segCount) segIdx = segCount - 1

    const segLen = cumDist[segIdx + 1] - cumDist[segIdx]
    if (segLen < 1e-9) {
      result.push({ x: segStart[segIdx].x, y: segStart[segIdx].y })
      continue
    }

    const t = Math.min(1, Math.max(0, (d - cumDist[segIdx]) / segLen))
    result.push({
      x: segStart[segIdx].x + t * (segEnd[segIdx].x - segStart[segIdx].x),
      y: segStart[segIdx].y + t * (segEnd[segIdx].y - segStart[segIdx].y)
    })
  }

  return result
}
