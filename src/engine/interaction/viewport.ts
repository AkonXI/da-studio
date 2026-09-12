import type { Point } from '../model/types'

/**
 * 共享视口状态 — 统一管理 scale / translateX / translateY，
 * 通过 onChange 回调由 Controller 统一调度图层重绘
 */
export class Viewport {
  private _scale = 1
  private _translateX = 0
  private _translateY = 0
  private _rotation = 0
  private _imageWidth = 0
  private _imageHeight = 0

  /** 视口变更回调（由 Controller 注册，调度图层重绘） */
  onChange: (() => void) | null = null

  /** @returns 当前缩放倍数 */
  get scale(): number {
    return this._scale
  }
  /** @returns 当前 X 平移量（图像坐标） */
  get translateX(): number {
    return this._translateX
  }
  /** @returns 当前 Y 平移量（图像坐标） */
  get translateY(): number {
    return this._translateY
  }
  /** 顺时针旋转的 90° 步数：0 / 1 / 2 / 3。 */
  get rotation(): number {
    return this._rotation
  }
  get rotationRadians(): number {
    return this._rotation * (Math.PI / 2)
  }
  get imageWidth(): number {
    return this._imageWidth
  }
  get imageHeight(): number {
    return this._imageHeight
  }
  get orientedWidth(): number {
    return this._rotation % 2 === 0 ? this._imageWidth : this._imageHeight
  }
  get orientedHeight(): number {
    return this._rotation % 2 === 0 ? this._imageHeight : this._imageWidth
  }

  setImageSize(width: number, height: number): void {
    this._imageWidth = Math.max(0, width)
    this._imageHeight = Math.max(0, height)
    this.onChange?.()
  }

  /** 设置图片方向，并保持当前画布中心对应的原图位置不跳变。 */
  setRotation(rotation: number, canvasWidth = 0, canvasHeight = 0): void {
    const center = this.toImage(canvasWidth / 2, canvasHeight / 2)
    this._rotation = ((Math.round(rotation) % 4) + 4) % 4
    const oriented = this.toOriented(center.x, center.y)
    this._translateX = oriented.x - canvasWidth / (2 * this._scale)
    this._translateY = oriented.y - canvasHeight / (2 * this._scale)
    this.onChange?.()
  }

  /**
   * 设置缩放倍数并通知
   * @param multi - 新的缩放倍数
   */
  zoom(multi: number): void {
    this._scale = multi
    this.onChange?.()
  }

  /**
   * 平移视口并通知
   * @param dx - 画布像素偏移（水平）
   * @param dy - 画布像素偏移（垂直）
   */
  pan(dx: number, dy: number): void {
    this._translateX += dx / this._scale
    this._translateY += dy / this._scale
    this.onChange?.()
  }

  /** 重置缩放为 1×，平移归零（通知只发一次） */
  reset(): void {
    this._batch(() => {
      this._scale = 1
      this._translateX = 0
      this._translateY = 0
    })
  }

  /**
   * 同时设置缩放和平移（通知只发一次，用于动画等场景）
   * @param scale - 新的缩放倍数
   * @param translateX - 新的 X 平移
   * @param translateY - 新的 Y 平移
   */
  setTransform(scale: number, translateX: number, translateY: number): void {
    this._batch(() => {
      this._scale = scale
      this._translateX = translateX
      this._translateY = translateY
    })
  }

  /**
   * 画布像素坐标 → 图像坐标
   * @param px - 画布 X
   * @param py - 画布 Y
   * @returns 图像坐标系下的 Point
   */
  toImage(px: number, py: number): Point {
    const x = px / this._scale + this._translateX
    const y = py / this._scale + this._translateY
    switch (this._rotation) {
      case 1:
        return { x: y, y: this._imageHeight - x }
      case 2:
        return { x: this._imageWidth - x, y: this._imageHeight - y }
      case 3:
        return { x: this._imageWidth - y, y: x }
      default:
        return { x, y }
    }
  }

  /**
   * 图像坐标 → 画布像素坐标
   * @param ix - 图像 X
   * @param iy - 图像 Y
   * @returns 画布像素坐标系下的 Point
   */
  toCanvas(ix: number, iy: number): Point {
    const point = this.toOriented(ix, iy)
    return {
      x: (point.x - this._translateX) * this._scale,
      y: (point.y - this._translateY) * this._scale
    }
  }

  /** 原图坐标转换到当前旋转方向的坐标系。 */
  toOriented(ix: number, iy: number): Point {
    switch (this._rotation) {
      case 1:
        return { x: this._imageHeight - iy, y: ix }
      case 2:
        return { x: this._imageWidth - ix, y: this._imageHeight - iy }
      case 3:
        return { x: iy, y: this._imageWidth - ix }
      default:
        return { x: ix, y: iy }
    }
  }

  /** 返回原图坐标直接映射到 Canvas 的仿射矩阵。 */
  canvasTransform(): [number, number, number, number, number, number] {
    const s = this._scale
    const tx = this._translateX
    const ty = this._translateY
    switch (this._rotation) {
      case 1:
        return [0, s, -s, 0, s * (this._imageHeight - tx), -s * ty]
      case 2:
        return [-s, 0, 0, -s, s * (this._imageWidth - tx), s * (this._imageHeight - ty)]
      case 3:
        return [0, -s, s, 0, -s * tx, s * (this._imageWidth - ty)]
      default:
        return [s, 0, 0, s, -s * tx, -s * ty]
    }
  }

  private _batch(fn: () => void): void {
    fn()
    this.onChange?.()
  }
}
