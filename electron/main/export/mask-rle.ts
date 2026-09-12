import sharp from 'sharp'
import type { RenderedMask } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function decodeBitmapCounts(counts: unknown, length: number): Buffer {
  const pixels = Buffer.alloc(length)
  if (!Array.isArray(counts)) return pixels
  let offset = 0
  let value: 0 | 1 = 0
  for (const rawLength of counts) {
    const runLength = Math.max(0, Math.floor(Number(rawLength) || 0))
    if (value === 1) pixels.fill(255, offset, Math.min(length, offset + runLength))
    offset += runLength
    if (offset >= length) break
    value = value === 0 ? 1 : 0
  }
  return pixels
}

/** 直接读取 bbox 裁剪后的最终行优先 RLE，不兼容旧操作路径数据。 */
export async function renderMask(
  shape: any,
  imageWidth: number,
  imageHeight: number
): Promise<RenderedMask | null> {
  const bitmap = shape?.bitmap
  const sourceWidth = Math.max(0, Math.floor(Number(bitmap?.width) || 0))
  const sourceHeight = Math.max(0, Math.floor(Number(bitmap?.height) || 0))
  if (!bitmap || sourceWidth === 0 || sourceHeight === 0) return null
  const sourceX = Math.floor(Number(bitmap.x) || 0)
  const sourceY = Math.floor(Number(bitmap.y) || 0)
  const x = clamp(sourceX, 0, imageWidth)
  const y = clamp(sourceY, 0, imageHeight)
  const right = clamp(sourceX + sourceWidth, 0, imageWidth)
  const bottom = clamp(sourceY + sourceHeight, 0, imageHeight)
  if (right <= x || bottom <= y) return null
  const width = right - x
  const height = bottom - y
  const source = decodeBitmapCounts(bitmap.counts, sourceWidth * sourceHeight)
  const clippedPixels = Buffer.alloc(width * height)
  for (let localY = 0; localY < height; localY++) {
    const sourceStart = (y - sourceY + localY) * sourceWidth + x - sourceX
    const row = source.subarray(sourceStart, sourceStart + width)
    row.copy(clippedPixels, localY * width)
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let area = 0
  for (let index = 0; index < clippedPixels.length; index++) {
    if (!clippedPixels[index]) continue
    area++
    const localX = index % width
    const localY = Math.floor(index / width)
    minX = Math.min(minX, localX)
    minY = Math.min(minY, localY)
    maxX = Math.max(maxX, localX)
    maxY = Math.max(maxY, localY)
  }
  if (area === 0) return null
  const tightWidth = maxX - minX + 1
  const tightHeight = maxY - minY + 1
  const pixels = Buffer.alloc(tightWidth * tightHeight)
  for (let localY = 0; localY < tightHeight; localY++) {
    const sourceStart = (minY + localY) * width + minX
    clippedPixels.subarray(sourceStart, sourceStart + tightWidth).copy(pixels, localY * tightWidth)
  }
  return {
    bbox: [x + minX, y + minY, tightWidth, tightHeight],
    width: tightWidth,
    height: tightHeight,
    pixels,
    area
  }
}

function appendRun(counts: number[], state: { value: 0 | 1 }, value: 0 | 1, length: number) {
  if (length <= 0) return
  if (state.value === value) counts[counts.length - 1] += length
  else {
    counts.push(length)
    state.value = value
  }
}

/** COCO 使用列优先（Fortran order）；整图空白通过 bbox 外的长 run 合并，不分配整图 Buffer。 */
export function maskCounts(
  rendered: RenderedMask | null,
  imageWidth: number,
  imageHeight: number
): number[] {
  const counts = [0]
  const state: { value: 0 | 1 } = { value: 0 }
  if (!rendered) {
    counts[0] = imageWidth * imageHeight
    return counts
  }
  const [originX, originY, width, height] = rendered.bbox
  for (let x = 0; x < imageWidth; x++) {
    if (x < originX || x >= originX + width) {
      appendRun(counts, state, 0, imageHeight)
      continue
    }
    appendRun(counts, state, 0, originY)
    const localX = x - originX
    for (let localY = 0; localY < height; localY++) {
      const value: 0 | 1 = rendered.pixels[localY * width + localX] ? 1 : 0
      appendRun(counts, state, value, 1)
    }
    appendRun(counts, state, 0, imageHeight - originY - height)
  }
  return counts
}

/** 与 COCO maskApi 的 rleToString 兼容的压缩 counts。 */
export function compressCounts(counts: number[]): string {
  let result = ''
  for (let index = 0; index < counts.length; index++) {
    let value = counts[index]
    if (index > 2) value -= counts[index - 2]
    let more = true
    while (more) {
      let character = value & 0x1f
      value >>= 5
      more = (character & 0x10) !== 0 ? value !== -1 : value !== 0
      if (more) character |= 0x20
      result += String.fromCharCode(character + 48)
    }
  }
  return result
}

export function cocoRle(rendered: RenderedMask | null, imageWidth: number, imageHeight: number) {
  return {
    size: [imageHeight, imageWidth],
    counts: compressCounts(maskCounts(rendered, imageWidth, imageHeight))
  }
}

export async function maskPng(rendered: RenderedMask): Promise<Buffer> {
  return sharp(rendered.pixels, {
    raw: { width: rendered.width, height: rendered.height, channels: 1 }
  })
    .png({ compressionLevel: 9, palette: true, colours: 2 })
    .toBuffer()
}
