import { ref, toRaw } from 'vue'
import type { Shape, Point } from '../engine/model/types'
import { sampleCurve, sampleEllipse } from '../engine/geometry/curve'
import type { MatchResult } from '../matcher/types'

let _worker: Worker | null = null

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('../matcher/worker.ts', import.meta.url), { type: 'module' })
  }
  return _worker
}

function shapeToPoints(shape: Shape): Point[] | null {
  if (shape.type === 'polygon' || shape.type === 'polyline') return toRaw(shape).points
  if (shape.type === 'curve') return sampleCurve(toRaw(shape).points)
  if (shape.type === 'ellipse') return sampleEllipse(toRaw(shape))
  if (shape.type === 'rect') {
    const { x, y, w, h, rotation } = shape
    const hw = w / 2,
      hh = h / 2
    const cos = Math.cos(rotation),
      sin = Math.sin(rotation)
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ].map((c) => ({ x: x + c.x * cos - c.y * sin, y: y + c.x * sin + c.y * cos }))
  }
  return null
}

function isClosedShape(shape: Shape): boolean {
  return shape.type === 'polygon' || shape.type === 'rect' || shape.type === 'ellipse'
}

export function comparableShapes(shapes: Shape[]): { label: string; idx: number }[] {
  return shapes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => ['rect', 'polyline', 'polygon', 'curve', 'ellipse'].includes(s.type))
    .filter(({ s }) => ('complete' in s ? s.complete : true))
    .map(({ s, i }) => {
      let detail = ''
      if (s.type === 'rect' || s.type === 'ellipse') detail = `${s.w.toFixed(0)}x${s.h.toFixed(0)}`
      else if ('points' in s) detail = `${s.points.length}顶点`
      return { idx: i, label: `${shapeTypeLabel(s)} ${i + 1} (${detail})` }
    })
}

function shapeTypeLabel(s: Shape): string {
  const map: Record<string, string> = {
    rect: '矩形',
    point: '点',
    polyline: '折线',
    polygon: '多边形',
    curve: '曲线',
    ellipse: '圆形/椭圆'
  }
  return map[s.type] || s.type
}

export function useComparison() {
  const templateIdx = ref<number | null>(null)
  const testIdx = ref<number | null>(null)
  const result = ref<MatchResult | null>(null)
  const loading = ref(false)
  let compareSeq = 0

  function compare(shapes: Shape[]) {
    const seq = ++compareSeq
    if (templateIdx.value == null || testIdx.value == null) return
    if (templateIdx.value >= shapes.length || testIdx.value >= shapes.length) {
      loading.value = false
      result.value = null
      return
    }
    const a = shapeToPoints(shapes[templateIdx.value])
    const b = shapeToPoints(shapes[testIdx.value])
    if (!a || !b) {
      loading.value = false
      result.value = null
      return
    }

    loading.value = true
    const worker = getWorker()
    const closed = isClosedShape(shapes[templateIdx.value])

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.requestId !== compareSeq) return
      loading.value = false
      if (e.data.error) {
        result.value = null
        return
      }
      result.value = e.data.result
    }
    worker.postMessage({
      requestId: seq,
      curveA: a,
      curveB: b,
      options: { spacing: 2, delta: 3, pct: 0.03, closed }
    })
  }

  function clear() {
    compareSeq++
    templateIdx.value = null
    testIdx.value = null
    result.value = null
    loading.value = false
  }

  function clearResult() {
    compareSeq++
    result.value = null
    loading.value = false
  }

  return { templateIdx, testIdx, result, loading, compare, clear, clearResult }
}
