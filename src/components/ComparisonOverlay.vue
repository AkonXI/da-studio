<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Meta, Point } from '../engine/model/types'
import type { MatchResult } from '../matcher/types'

const props = defineProps<{
  result: MatchResult
  getMeta: () => Meta
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

function toCanvasX(x: number) {
  const m = props.getMeta()
  return (x - m.translateX) * m.scale
}
function toCanvasY(y: number) {
  const m = props.getMeta()
  return (y - m.translateY) * m.scale
}

function drawOBB(ctx: CanvasRenderingContext2D) {
  const { corners } = props.result.obb
  ctx.save()
  ctx.strokeStyle = 'rgba(63, 185, 80, 0.6)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([8, 5])
  ctx.beginPath()
  ctx.moveTo(toCanvasX(corners[0].x), toCanvasY(corners[0].y))
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(toCanvasX(corners[i].x), toCanvasY(corners[i].y))
  }
  ctx.closePath()
  ctx.stroke()
  // 对角线
  ctx.beginPath()
  ctx.moveTo(toCanvasX(corners[0].x), toCanvasY(corners[0].y))
  ctx.lineTo(toCanvasX(corners[2].x), toCanvasY(corners[2].y))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawCurveA(ctx: CanvasRenderingContext2D) {
  const points = props.result.resampledA
  if (points.length === 0) return
  ctx.save()
  ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(toCanvasX(points[0].x), toCanvasY(points[0].y))
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(toCanvasX(points[i].x), toCanvasY(points[i].y))
  }
  ctx.stroke()
  ctx.restore()
}

function drawCurveB(ctx: CanvasRenderingContext2D) {
  const { resampledB, violations } = props.result
  if (resampledB.length < 2) return

  const violationSet = new Set(violations.map((v) => `${v.x.toFixed(4)},${v.y.toFixed(4)}`))
  const key = (p: Point) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`

  // 合规段 — 淡色
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255, 80, 80, 0.18)'
  ctx.lineWidth = 2
  ctx.beginPath()
  let penDown = false

  for (let i = 0; i < resampledB.length; i++) {
    const isV = violationSet.has(key(resampledB[i]))
    const cx = toCanvasX(resampledB[i].x)
    const cy = toCanvasY(resampledB[i].y)

    if (isV) {
      if (penDown) {
        ctx.stroke()
        ctx.beginPath()
        penDown = false
      }
    } else {
      if (!penDown) {
        ctx.moveTo(cx, cy)
        penDown = true
      } else {
        ctx.lineTo(cx, cy)
      }
    }
  }
  if (penDown) ctx.stroke()
  ctx.restore()

  // 违规段 — 醒目的橙红色
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255, 60, 0, 0.88)'
  ctx.lineWidth = 3
  ctx.beginPath()
  penDown = false

  for (let i = 0; i < resampledB.length; i++) {
    const isV = violationSet.has(key(resampledB[i]))
    const cx = toCanvasX(resampledB[i].x)
    const cy = toCanvasY(resampledB[i].y)

    if (isV) {
      if (!penDown) {
        ctx.moveTo(cx, cy)
        penDown = true
      } else {
        ctx.lineTo(cx, cy)
      }
    } else {
      if (penDown) {
        ctx.stroke()
        ctx.beginPath()
        penDown = false
      }
    }
  }
  if (penDown) ctx.stroke()
  ctx.restore()
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, 600, 600)
  drawOBB(ctx)
  drawCurveA(ctx)
  drawCurveB(ctx)
}

// rAF 持续重绘，每帧从引擎读实时 viewport 坐标
let rafId: number | null = null

function startLoop() {
  function loop() {
    render()
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

watch(
  () => props.result,
  (v) => {
    stopLoop()
    if (v) nextTick(startLoop)
  }
)

onMounted(() => {
  if (props.result) startLoop()
})

onUnmounted(stopLoop)
</script>

<template>
  <canvas
    ref="canvasRef"
    width="600"
    height="600"
    class="absolute top-0 left-0 z-30 pointer-events-none"
  />
</template>
