import assert from 'node:assert/strict'
import { Viewport } from '../src/engine/interaction/viewport.ts'

const viewport = new Viewport()
viewport.setImageSize(640, 360)
viewport.setTransform(1.75, -12, 23)

for (let rotation = 0; rotation < 4; rotation++) {
  viewport.setRotation(rotation, 900, 600)
  for (const point of [
    { x: 0, y: 0 },
    { x: 123.5, y: 87.25 },
    { x: 640, y: 360 }
  ]) {
    const canvas = viewport.toCanvas(point.x, point.y)
    const restored = viewport.toImage(canvas.x, canvas.y)
    assert.ok(Math.abs(restored.x - point.x) < 1e-8)
    assert.ok(Math.abs(restored.y - point.y) < 1e-8)

    const [a, b, c, d, e, f] = viewport.canvasTransform()
    assert.ok(Math.abs(a * point.x + c * point.y + e - canvas.x) < 1e-8)
    assert.ok(Math.abs(b * point.x + d * point.y + f - canvas.y) < 1e-8)
  }
  assert.equal(viewport.orientedWidth, rotation % 2 === 0 ? 640 : 360)
  assert.equal(viewport.orientedHeight, rotation % 2 === 0 ? 360 : 640)
}

console.log('viewport rotation tests passed')
