import { Viewport } from '../interaction/viewport'
import type { ImageAdjustments } from '../model/types'

/** 图像渲染层，负责加载和绘制底图，支持缩放与平移 */
export class ImageLayer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  img: HTMLImageElement | null
  _viewport: Viewport
  adjustments: ImageAdjustments
  private _loadVersion = 0

  /**
   * @param canvas - 目标画布元素
   * @param viewport - 视口状态
   */
  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2d context')
    this.ctx = ctx
    this.img = null
    this._viewport = viewport
    this.adjustments = { brightness: 100, contrast: 100, saturation: 100 }
  }

  /**
   * 加载图片并初始化画布尺寸
   * @param src - 图片 URL
   * @returns 加载完成的 Image 元素
   */
  loadImage(src: string): Promise<HTMLImageElement | null> {
    const loadVersion = ++this._loadVersion
    return new Promise((resolve, reject) => {
      const img = new Image()
      if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (loadVersion !== this._loadVersion) {
          resolve(null)
          return
        }
        this.img = img
        this._viewport.setImageSize(img.naturalWidth || img.width, img.naturalHeight || img.height)
        this._draw()
        resolve(img)
      }
      img.onerror = (error) => {
        if (loadVersion !== this._loadVersion) resolve(null)
        else reject(error)
      }
      img.src = src
    })
  }

  /** 内部重绘：清空画布 → 仅裁剪当前视口内的图像部分绘制 */
  _draw(): void {
    this.clear()
    if (!this.img) return
    this.ctx.save()
    this.ctx.filter = `brightness(${this.adjustments.brightness}%) contrast(${this.adjustments.contrast}%) saturate(${this.adjustments.saturation}%)`
    this.ctx.setTransform(...this._viewport.canvasTransform())
    this.ctx.drawImage(this.img, 0, 0)
    this.ctx.restore()
  }

  /** 触发视口重绘（由 Viewport.onChange 回调调用） */
  redraw(): void {
    this._draw()
  }

  /** 设置仅影响底图显示的图像参数，不改变原图或标注坐标。 */
  setAdjustments(adjustments: ImageAdjustments): void {
    this.adjustments = { ...adjustments }
    this._draw()
  }

  /** 清空整个画布 */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * 设置缩放倍率并重绘
   * @param multi - 缩放倍数（1 = 原始大小）
   */
  zoom(multi: number): void {
    this._viewport.zoom(multi)
  }

  /**
   * 平移视口
   * @param dx - 画布像素偏移量（水平）
   * @param dy - 画布像素偏移量（垂直）
   */
  pan(dx: number, dy: number): void {
    this._viewport.pan(dx, dy)
  }
}
