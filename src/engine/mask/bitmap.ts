import type { MaskBitmap, MaskOperation, Point } from '../model/types'

export function emptyMaskBitmap(): MaskBitmap {
  return { x: 0, y: 0, width: 0, height: 0, counts: [0] }
}

/** 将 bbox 内行优先 RLE 解码为 0/1 像素。 */
export function decodeMaskBitmap(bitmap: MaskBitmap): Uint8Array {
  const pixels = new Uint8Array(Math.max(0, bitmap.width * bitmap.height))
  let offset = 0
  let value: 0 | 1 = 0
  for (const rawLength of bitmap.counts) {
    const length = Math.max(0, Math.floor(Number(rawLength) || 0))
    if (value === 1) pixels.fill(1, offset, Math.min(pixels.length, offset + length))
    offset += length
    if (offset >= pixels.length) break
    value = value === 0 ? 1 : 0
  }
  return pixels
}

/** 将 0/1 像素编码为行优先、从背景 run 开始的 RLE。 */
export function encodeMaskPixels(pixels: ArrayLike<number>): number[] {
  const counts = [0]
  let value: 0 | 1 = 0
  for (let index = 0; index < pixels.length; index++) {
    const next: 0 | 1 = pixels[index] ? 1 : 0
    if (next === value) counts[counts.length - 1]++
    else {
      counts.push(1)
      value = next
    }
  }
  return counts
}

function operationBounds(operation: MaskOperation) {
  if (operation.kind === 'polygon') {
    if (operation.points.length === 0) return null
    return {
      left: Math.floor(Math.min(...operation.points.map((point) => point.x))),
      top: Math.floor(Math.min(...operation.points.map((point) => point.y))),
      right: Math.ceil(Math.max(...operation.points.map((point) => point.x))) + 1,
      bottom: Math.ceil(Math.max(...operation.points.map((point) => point.y))) + 1
    }
  }
  if (operation.points.length === 0) return null
  const radius = operation.size / 2 + 1
  return {
    left: Math.floor(Math.min(...operation.points.map((point) => point.x - radius))),
    top: Math.floor(Math.min(...operation.points.map((point) => point.y - radius))),
    right: Math.ceil(Math.max(...operation.points.map((point) => point.x + radius))),
    bottom: Math.ceil(Math.max(...operation.points.map((point) => point.y + radius)))
  }
}

function tightBitmap(pixels: Uint8Array, width: number, height: number, x: number, y: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let index = 0; index < pixels.length; index++) {
    if (!pixels[index]) continue
    const px = index % width
    const py = Math.floor(index / width)
    minX = Math.min(minX, px)
    minY = Math.min(minY, py)
    maxX = Math.max(maxX, px)
    maxY = Math.max(maxY, py)
  }
  if (maxX < 0) return emptyMaskBitmap()
  const tightWidth = maxX - minX + 1
  const tightHeight = maxY - minY + 1
  const tight = new Uint8Array(tightWidth * tightHeight)
  for (let py = 0; py < tightHeight; py++) {
    const source = (minY + py) * width + minX
    tight.set(pixels.subarray(source, source + tightWidth), py * tightWidth)
  }
  return {
    x: x + minX,
    y: y + minY,
    width: tightWidth,
    height: tightHeight,
    counts: encodeMaskPixels(tight)
  }
}

/** 从完整 0/1 像素平面创建自动收紧 bbox 的 MaskBitmap。 */
export function maskBitmapFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  x = 0,
  y = 0
): MaskBitmap {
  if (pixels.length !== width * height) {
    throw new Error('Mask pixel length does not match width × height')
  }
  return tightBitmap(pixels, width, height, x, y)
}

/** 将一次画笔、擦除或矩形操作直接合成到最终像素点阵。 */
export function applyMaskOperation(
  bitmap: MaskBitmap,
  operation: MaskOperation,
  imageSize?: { width: number; height: number } | null
): MaskBitmap {
  const operationBox = operationBounds(operation)
  const hasBitmap = bitmap.width > 0 && bitmap.height > 0
  const addsPixels = operation.operation === 'paint'
  if (!operationBox || (!addsPixels && !hasBitmap)) return bitmap

  const existingBox = hasBitmap
    ? { left: bitmap.x, top: bitmap.y, right: bitmap.x + bitmap.width, bottom: bitmap.y + bitmap.height }
    : operationBox
  const source =
    addsPixels
      ? {
          left: Math.min(existingBox.left, operationBox.left),
          top: Math.min(existingBox.top, operationBox.top),
          right: Math.max(existingBox.right, operationBox.right),
          bottom: Math.max(existingBox.bottom, operationBox.bottom)
        }
      : existingBox
  const left = Math.max(0, source.left)
  const top = Math.max(0, source.top)
  const right = Math.min(imageSize?.width ?? source.right, source.right)
  const bottom = Math.min(imageSize?.height ?? source.bottom, source.bottom)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  if (width === 0 || height === 0) return emptyMaskBitmap()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return bitmap
  if (hasBitmap) {
    const existing = decodeMaskBitmap(bitmap)
    const imageData = context.createImageData(bitmap.width, bitmap.height)
    for (let index = 0; index < existing.length; index++) {
      if (!existing[index]) continue
      const target = index * 4
      imageData.data[target] = 255
      imageData.data[target + 1] = 255
      imageData.data[target + 2] = 255
      imageData.data[target + 3] = 255
    }
    context.putImageData(imageData, bitmap.x - left, bitmap.y - top)
  }

  context.save()
  context.translate(-left, -top)
  context.globalCompositeOperation =
    addsPixels ? 'source-over' : 'destination-out'
  context.fillStyle = '#fff'
  context.strokeStyle = '#fff'
  if (operation.kind === 'polygon') {
    if (operation.points.length >= 3) {
      context.beginPath()
      context.moveTo(operation.points[0].x, operation.points[0].y)
      operation.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.closePath()
      context.fill()
    }
  } else if (operation.points.length > 0) {
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = operation.size
    const first = operation.points[0]
    if (operation.points.length === 1) {
      context.beginPath()
      context.arc(first.x, first.y, operation.size / 2, 0, Math.PI * 2)
      context.fill()
    } else {
      context.beginPath()
      context.moveTo(first.x, first.y)
      operation.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
      context.stroke()
    }
  }
  context.restore()

  const rgba = context.getImageData(0, 0, width, height).data
  const pixels = new Uint8Array(width * height)
  for (let index = 0; index < pixels.length; index++) pixels[index] = rgba[index * 4 + 3] >= 128 ? 1 : 0
  return tightBitmap(pixels, width, height, left, top)
}

export function maskBitmapContains(bitmap: MaskBitmap, point: Point): boolean {
  const x = Math.floor(point.x) - bitmap.x
  const y = Math.floor(point.y) - bitmap.y
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return false
  return decodeMaskBitmap(bitmap)[y * bitmap.width + x] === 1
}

/** 对多个 bbox 位图做像素并集，并再次收紧 AABB。 */
export function mergeMaskBitmaps(bitmaps: MaskBitmap[]): MaskBitmap {
  const valid = bitmaps.filter((bitmap) => bitmap.width > 0 && bitmap.height > 0)
  if (valid.length === 0) return emptyMaskBitmap()
  const left = Math.min(...valid.map((bitmap) => bitmap.x))
  const top = Math.min(...valid.map((bitmap) => bitmap.y))
  const right = Math.max(...valid.map((bitmap) => bitmap.x + bitmap.width))
  const bottom = Math.max(...valid.map((bitmap) => bitmap.y + bitmap.height))
  const width = right - left
  const height = bottom - top
  const pixels = new Uint8Array(width * height)
  valid.forEach((bitmap) => {
    const source = decodeMaskBitmap(bitmap)
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        if (source[y * bitmap.width + x]) {
          pixels[(bitmap.y - top + y) * width + bitmap.x - left + x] = 1
        }
      }
    }
  })
  return tightBitmap(pixels, width, height, left, top)
}

export function maskBitmapRegionCount(bitmap: MaskBitmap): number {
  const pixels = decodeMaskBitmap(bitmap)
  let regions = 0
  const queue = new Int32Array(pixels.length)
  for (let index = 0; index < pixels.length; index++) {
    if (!pixels[index]) continue
    regions++
    let head = 0
    let tail = 0
    pixels[index] = 0
    queue[tail++] = index
    while (head < tail) {
      const current = queue[head++]
      const x = current % bitmap.width
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < bitmap.width ? current + 1 : -1,
        current >= bitmap.width ? current - bitmap.width : -1,
        current + bitmap.width < pixels.length ? current + bitmap.width : -1
      ]
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !pixels[neighbor]) continue
        pixels[neighbor] = 0
        queue[tail++] = neighbor
      }
    }
  }
  return regions
}
