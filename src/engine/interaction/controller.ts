import {
  DEFAULT_GROUPS,
  createShapeId,
  deepCopy,
  ensureShapeIds,
  normalizeAngle
} from '../shared/utils'
import { ImageLayer } from '../rendering/image-layer'
import { ShapeLayer } from '../rendering/shape-layer'
import { Viewport } from './viewport'
import { pointInPolygon, unionPolygons } from '../geometry/polygon-union'
import { splitPolygonWithPath, splitPolylineAtCuts } from '../geometry/path-split'
import {
  COCO_PERSON_KEYPOINTS,
  createCocoPersonPoints,
  jointPointLabel,
  normalizeCocoPersonJoint,
  placedJointPoints,
  setJointPoint
} from '../joint/coco-person'
import {
  applyMaskOperation,
  emptyMaskBitmap,
  maskBitmapContains,
  mergeMaskBitmaps
} from '../mask/bitmap'
import type {
  Shape,
  Group,
  Meta,
  RectShape,
  PolylineShape,
  PolygonShape,
  CurveShape,
  MaskShape,
  CuboidShape,
  JointShape,
  DragCache,
  ControllerState,
  HandlerReturn,
  ControllerOpts,
  InteractionMode,
  MaskTool,
  AuxiliaryTool,
  ImageAdjustments,
  MaskOperation,
  MaskBitmap,
  Point
} from '../model/types'

function pathLength(points: Point[]): number {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    )
  }
  return length
}

function withoutAdjacentDuplicates(points: Point[]): Point[] {
  const result = points.filter(
    (point, index) =>
      index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1e-6
  )
  if (
    result.length > 1 &&
    Math.hypot(
      result[0].x - result[result.length - 1].x,
      result[0].y - result[result.length - 1].y
    ) <= 1e-6
  ) {
    result.pop()
  }
  return result
}

function cuboidVertices(start: Point, end: Point): Point[] {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  const depth = Math.min(right - left, bottom - top) * 0.22
  return [
    { x: left + depth, y: top + depth },
    { x: right, y: top + depth },
    { x: right, y: bottom },
    { x: left + depth, y: bottom },
    { x: left, y: top },
    { x: right - depth, y: top },
    { x: right - depth, y: bottom - depth },
    { x: left, y: bottom - depth }
  ]
}

function circleEnd(start: Point, end: Point): Point {
  const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
  return {
    x: start.x + (end.x < start.x ? -size : size),
    y: start.y + (end.y < start.y ? -size : size)
  }
}

function rectVertices(shape: RectShape): Point[] {
  const halfWidth = shape.w / 2
  const halfHeight = shape.h / 2
  const cos = Math.cos(shape.rotation || 0)
  const sin = Math.sin(shape.rotation || 0)
  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ].map((point) => ({
    x: shape.x + point.x * cos - point.y * sin,
    y: shape.y + point.x * sin + point.y * cos
  }))
}

/**
 * 标注控制器 — 管理标注模式、撤销/重做、鼠标交互，协调 ImageLayer 与 ShapeLayer
 * @param opts - 初始化选项（mode / interactionMode / readonly / onChange / groups）
 */
export class AnnotationController {
  /** 当前绘制模式：rect / point / polyline / polygon / mask / cuboid */
  mode: string
  /** 当前交互模式：draw（绘制） | select（选择/编辑） */
  interactionMode: InteractionMode
  /** 是否只读（禁止编辑） */
  readonly: boolean
  /** 图形/元数据变更时的回调 */
  onChange: (_shapes: Shape[], _meta: Meta) => void
  /** 视口完成逐帧重绘后的回调，供独立覆盖层同步变换。 */
  onViewportChange: () => void
  _groupMap: Record<string, Group>
  /** 当前选中分组的 name */
  currentGroup: string
  _historyStack: { shapes: Shape[]; interactionMode: InteractionMode; mode: string }[]
  _historyIndex: number
  _state: ControllerState
  _viewport: Viewport
  _rafId: number | null
  _notifyRafId: number | null
  _viewportRafId: number | null
  _hoverRafId: number | null
  _onPolygonComplete: ((_shape: PolygonShape) => void) | null
  _imageLayer: ImageLayer | null
  _shapeLayer: ShapeLayer | null
  _boundHandlers: HandlerReturn | null
  maskTool: MaskTool
  maskBrushSize: number
  imageAdjustments: ImageAdjustments
  auxiliaryTool: AuxiliaryTool
  _pathClipStart: {
    shapeIdx: number
    edgeIdx: number
    ratio: number
    point: Point
    points: Point[]
  } | null
  _polygonMergeStart: number | null
  _pathReshape: {
    shapeIdx: number
    start: { edgeIdx: number; ratio: number; point: Point }
    points: Point[]
  } | null
  _activeMaskIndex: number | null
  _maskAppendLocked: boolean
  _maskLastPoint: Point | null
  _maskPolygonPoints: Point[]
  _maskMergeStart: number | null
  _temporarySelect: boolean
  _interactionModeBeforeTemporary: InteractionMode | null

  constructor(opts: ControllerOpts = {}) {
    this.mode = opts.mode || 'rect'
    this.interactionMode = opts.interactionMode || 'draw'
    this.readonly = opts.readonly || false
    this.onChange = opts.onChange || (() => {})
    this.onViewportChange = opts.onViewportChange || (() => {})
    const groups = opts.groups?.length ? opts.groups : DEFAULT_GROUPS
    this._groupMap = {}
    groups.forEach((g) => {
      this._groupMap[g.name] = g
    })
    this.currentGroup = groups[0].name

    this._historyStack = []
    this._historyIndex = -1
    this._viewport = new Viewport()
    this._state = {
      drawing: false,
      dragging: false,
      resizing: false,
      panning: false,
      rotating: false,
      selecting: false,
      dragIdx: -1,
      dragVertexIdx: -1,
      dragFaceVertexIndices: null,
      dragCache: null,
      dragStart: null,
      resizeDirection: 'OUT',
      resizeCache: null,
      resizeStartLocal: null,
      rotateCache: null,
      rotateStartAngle: null,
      offsetAngle: null,
      panStart: null,
      drawStart: null,
      selectStart: null
    }

    this._rafId = null
    this._notifyRafId = null
    this._viewportRafId = null
    this._hoverRafId = null

    this._onPolygonComplete = null
    this._imageLayer = null
    this._shapeLayer = null
    this._boundHandlers = null
    this.maskTool = 'brush'
    this.maskBrushSize = 24
    this.imageAdjustments = { brightness: 100, contrast: 100, saturation: 100 }
    this.auxiliaryTool = 'move'
    this._pathClipStart = null
    this._polygonMergeStart = null
    this._pathReshape = null
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._maskLastPoint = null
    this._maskPolygonPoints = []
    this._maskMergeStart = null
    this._temporarySelect = false
    this._interactionModeBeforeTemporary = null
  }

  /**
   * 挂载画布，绑定鼠标事件
   * @param imageCanvas - 底图画布
   * @param shapeCanvas - 图形画布
   * @param imageSrc - 可选图片 URL，缺省时生成示例渐变图
   */
  mount(
    imageCanvas: HTMLCanvasElement,
    shapeCanvas: HTMLCanvasElement,
    imageSrc?: string
  ): Promise<void> {
    this._imageLayer = new ImageLayer(imageCanvas, this._viewport)
    this._imageLayer.setAdjustments(this.imageAdjustments)
    this._shapeLayer = new ShapeLayer(shapeCanvas, this._viewport)
    this._shapeLayer.mode = this.mode
    this._boundHandlers = this._bindHandlers()
    const h = this._boundHandlers
    shapeCanvas.addEventListener('mousedown', h.onMouseDown)
    shapeCanvas.addEventListener('mousemove', h.onMouseMove)
    shapeCanvas.addEventListener('mouseup', h.onMouseUp)
    shapeCanvas.addEventListener('mouseout', h.onMouseLeave)
    shapeCanvas.addEventListener('contextmenu', (e) => e.preventDefault())
    shapeCanvas.addEventListener('wheel', h.onWheel, { passive: false })

    const src = imageSrc || this._generateSampleImage()
    this._viewport.onChange = () => {
      if (this._viewportRafId !== null) return
      this._viewportRafId = requestAnimationFrame(() => {
        this._viewportRafId = null
        this._imageLayer?.redraw()
        this._shapeLayer?.redraw()
        this.onViewportChange()
      })
    }

    return this._imageLayer.loadImage(src).then((image) => {
      if (image) this._shapeLayer!.drawHistory()
    })
  }

  /**
   * 生成示例渐变图片（无外部图片时的默认底图）
   * @returns data URL 格式的 1920×1080 渐变+网格图片
   */
  private _generateSampleImage(): string {
    const c = document.createElement('canvas')
    c.width = 1920
    c.height = 1080
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    const g = ctx.createLinearGradient(0, 0, 1920, 1080)
    g.addColorStop(0, '#e3f2fd')
    g.addColorStop(0.5, '#f3e5f5')
    g.addColorStop(1, '#e8f5e9')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1920, 1080)
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 1920; i += 50) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 1080)
      ctx.stroke()
    }
    for (let i = 0; i <= 1080; i += 50) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(1920, i)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(960, 540, 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fill()
    return c.toDataURL()
  }

  /**
   * 设置绘制模式
   * @param mode - 绘制模式：rect | point | polyline | polygon
   */
  setMode(mode: string): void {
    if (!this._shapeLayer) return
    const poly = this._activePolygon()
    if (poly && poly.points.length >= 3) {
      poly.complete = true
    } else if (poly) {
      poly.points = []
      this._shapeLayer.popShape()
    }
    const pl = this._activePolyline()
    if (pl && pl.points.length >= 2) {
      pl.complete = true
    } else if (pl) {
      pl.points = []
      this._shapeLayer.popShape()
    }
    const curve = this._activeCurve()
    if (curve && curve.points.length >= 2) {
      curve.complete = true
    } else if (curve) {
      curve.points = []
      this._shapeLayer.popShape()
    }
    const joint = this._activeJoint()
    if (joint && placedJointPoints(joint).length > 0) {
      joint.complete = true
      joint.nextPointIndex = joint.points.length
    } else if (joint) {
      joint.points = []
      this._shapeLayer.popShape()
    }
    const cuboid = this._activeCuboid()
    if (cuboid && cuboid.points.length >= 2) {
      cuboid.complete = true
    } else if (cuboid) {
      cuboid.points = []
      this._shapeLayer.popShape()
    }
    if (mode !== 'mask') {
      this._activeMaskIndex = null
      this._maskAppendLocked = false
      this._maskLastPoint = null
      this._maskPolygonPoints = []
      this._maskMergeStart = null
      this._shapeLayer.clearLivePath()
    }
    this.mode = mode
    this._shapeLayer.mode = mode
    this._shapeLayer.clearCursorPreview()
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 设置交互模式
   * @param mode - draw（绘制）| select（选择/编辑）
   */
  setInteractionMode(mode: InteractionMode): void {
    this._temporarySelect = false
    this._interactionModeBeforeTemporary = null
    if (mode === 'select') {
      this._activeMaskIndex = null
      this._maskAppendLocked = false
      this._maskLastPoint = null
    }
    if (mode === 'select' && this.interactionMode === 'draw' && this._shapeLayer) {
      this.completePolygon()
      this.completePolyline()
      this.completeCurve()
      this.completeJoint()
      this.completeCuboid()
      const poly = this._activePolygon()
      if (poly && !poly.complete) {
        poly.points = []
        this._shapeLayer.popShape()
      }
      const pl = this._activePolyline()
      if (pl && !pl.complete) {
        pl.points = []
        this._shapeLayer.popShape()
      }
      const cuboid = this._activeCuboid()
      if (cuboid && !cuboid.complete) {
        cuboid.points = []
        this._shapeLayer.popShape()
      }
      const curve = this._activeCurve()
      if (curve && !curve.complete) {
        curve.points = []
        this._shapeLayer.popShape()
      }
      const joint = this._activeJoint()
      if (joint && !joint.complete) {
        joint.points = []
        this._shapeLayer.popShape()
      }
      if (poly || pl || curve || joint || cuboid) this._shapeLayer.drawHistory()
    }
    if (mode === 'draw') {
      this._activeMaskIndex = null
      this._maskAppendLocked = false
      this._maskPolygonPoints = []
      this._maskMergeStart = null
    }
    this.interactionMode = mode
    if (mode === 'draw') {
      this.auxiliaryTool = 'move'
      this._pathClipStart = null
      this._polygonMergeStart = null
      this._pathReshape = null
      this._shapeLayer?.clearLivePath()
    }
    if (this._shapeLayer) this._shapeLayer.interactionMode = mode
    if (this._shapeLayer && this._shapeLayer.current >= 0) {
      this._shapeLayer.shapes.forEach((shape) => {
        shape.current = false
      })
      this._shapeLayer.current = -1
      this._shapeLayer.drawHistory()
    }
    this._notify()
  }

  /** 按住 Ctrl 时临时进入选择模式；释放后无损恢复，不会完成正在绘制的路径。 */
  setTemporarySelect(active: boolean): void {
    if (!this._shapeLayer || this.readonly) return
    if (active) {
      if (this._temporarySelect || this.interactionMode === 'select') return
      this._interactionModeBeforeTemporary = this.interactionMode
      this._temporarySelect = true
      this.interactionMode = 'select'
      this._shapeLayer.interactionMode = 'select'
    } else {
      if (!this._temporarySelect) return
      const restore = this._interactionModeBeforeTemporary ?? 'draw'
      this._temporarySelect = false
      this._interactionModeBeforeTemporary = null
      this.interactionMode = restore
      this._shapeLayer.interactionMode = restore
    }
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 设置只读状态
   * @param v - true 为只读，自动切换 select 模式
   */
  setReadonly(v: boolean): void {
    this.readonly = v
    if (v) this.setInteractionMode('select')
  }

  /**
   * 设置当前绘图分组
   * @param color - 分组 name（如 'red'、'blue'）
   */
  setGroup(color: string): void {
    if (!this._shapeLayer) return
    if (!this._groupMap[color]) return
    this.currentGroup = color
    this._shapeLayer._group = color
  }

  /** 设置 Mask 子工具。 */
  setMaskTool(tool: MaskTool): void {
    if (tool !== this.maskTool) {
      this._maskPolygonPoints = []
      this._maskMergeStart = null
      this._shapeLayer?.clearLivePath()
    }
    if (tool === 'merge') {
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    this.maskTool = tool
    this._notify()
  }

  /** Ctrl + 点击建立后续擦除、裁剪和附加绘制的 Mask 目标。 */
  hasActiveMaskTarget(): boolean {
    if (!this._shapeLayer || !this._maskAppendLocked || this._activeMaskIndex === null) return false
    return this._shapeLayer.shapes[this._activeMaskIndex]?.type === 'mask'
  }

  isMaskPolygonActive(): boolean {
    return this._maskPolygonPoints.length > 0
  }

  isMaskMergePending(): boolean {
    return this._maskMergeStart !== null
  }

  /** 设置 Mask 画笔直径（图像像素）。 */
  setMaskBrushSize(size: number): void {
    this.maskBrushSize = Math.max(2, Math.min(200, size))
    this._notify()
  }

  /** 设置底图显示参数；标注数据和导出的原图保持不变。 */
  setImageAdjustments(adjustments: ImageAdjustments): void {
    this.imageAdjustments = {
      brightness: Math.max(0, Math.min(200, adjustments.brightness)),
      contrast: Math.max(0, Math.min(200, adjustments.contrast)),
      saturation: Math.max(0, Math.min(200, adjustments.saturation))
    }
    this._imageLayer?.setAdjustments(this.imageAdjustments)
    this._notify()
  }

  /** 切换画布标注名称标签，不影响标注本体和导出。 */
  setLabelsVisible(visible: boolean): void {
    if (!this._shapeLayer) return
    this._shapeLayer.showLabels = visible
    this._shapeLayer.drawHistory()
    this._notify()
  }

  areLabelsVisible(): boolean {
    return this._shapeLayer?.showLabels ?? true
  }

  setGridVisible(visible: boolean): void {
    if (!this._shapeLayer) return
    this._shapeLayer.showGrid = visible
    this._shapeLayer.drawHistory()
    this._notify()
  }

  isGridVisible(): boolean {
    return this._shapeLayer?.showGrid ?? true
  }

  setCrosshairVisible(visible: boolean): void {
    if (!this._shapeLayer) return
    this._shapeLayer.showCrosshair = visible
    this._shapeLayer.drawHistory()
    this._notify()
  }

  isCrosshairVisible(): boolean {
    return this._shapeLayer?.showCrosshair ?? true
  }

  /** 图片按 90° 步进旋转；正数顺时针，负数逆时针。 */
  rotateImage(step: number): void {
    const canvas = this._shapeLayer?.canvas
    if (!canvas) return
    this._viewport.setRotation(this._viewport.rotation + step, canvas.width, canvas.height)
    this.fitImageToCanvas()
  }

  getImageRotation(): number {
    return this._viewport.rotation
  }

  setHoveredShape(index: number | null): void {
    this._shapeLayer?.setHoveredShape(index)
  }

  /** 设置路径辅助编辑工具。 */
  setAuxiliaryTool(tool: AuxiliaryTool): void {
    this.auxiliaryTool = tool
    this._pathClipStart = null
    this._pathReshape = null
    this._shapeLayer?.clearLivePath()
    let selected = this._shapeLayer?.shapes[this._shapeLayer.current]
    if (tool !== 'move' && selected?.type === 'rect') {
      selected = this._convertRectToPolygon(this._shapeLayer!.current) || undefined
      this._saveSnapshot()
      this._shapeLayer!.drawHistory()
    }
    this._polygonMergeStart =
      tool === 'merge-polygons' && selected?.type === 'polygon' && selected.complete
        ? this._shapeLayer!.current
        : null
    this._notify()
  }

  isPathClipPending(): boolean {
    return this._pathClipStart !== null
  }

  isPolygonMergePending(): boolean {
    return this._polygonMergeStart !== null
  }

  isPathReshapePending(): boolean {
    return this._pathReshape !== null
  }

  /**
   * 缩放视口
   * @param delta - 增量步长（>0 放大, <0 缩小）
   */
  zoom(delta: number): void {
    if (!this._shapeLayer) return
    const newRate = Math.max(0.01, this._viewport.scale + delta)
    this._viewport.zoom(newRate)
    this._notify()
  }

  /**
   * 平移视口
   * @param dx - 画布像素偏移（水平）
   * @param dy - 画布像素偏移（垂直）
   */
  pan(dx: number, dy: number): void {
    if (!this._shapeLayer) return
    this._viewport.pan(dx, dy)
    this._notify()
  }

  /** 将画布像素坐标转换为原图坐标，供状态栏等外部 UI 使用。 */
  toImagePoint(pixelX: number, pixelY: number): Point {
    return this._viewport.toImage(pixelX, pixelY)
  }

  toCanvasPoint(imageX: number, imageY: number): Point {
    return this._viewport.toCanvas(imageX, imageY)
  }

  getCanvasTransform(): [number, number, number, number, number, number] {
    return this._viewport.canvasTransform()
  }

  /** 返回当前原图尺寸，图片尚未完成加载时返回 null。 */
  getImageSize(): { width: number; height: number } | null {
    const image = this._imageLayer?.img
    if (!image) return null
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
  }

  /** 获取原始底图 data URL，供本地 SAM Worker 计算图像嵌入。 */
  getImageDataUrl(): string | null {
    const image = this._imageLayer?.img
    if (!image || image.width <= 0 || image.height <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    try {
      return canvas.toDataURL('image/png')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        return image.currentSrc || image.src || null
      }
      throw error
    }
  }

  /** 将 SAM 位图结果加入当前分组。 */
  addMaskBitmap(bitmap: MaskBitmap): void {
    if (!this._shapeLayer || bitmap.width <= 0 || bitmap.height <= 0) return
    this._shapeLayer.shapes.forEach((shape) => {
      shape.current = false
    })
    this._shapeLayer.addShape({
      id: createShapeId(),
      type: 'mask',
      bitmap: {
        x: bitmap.x,
        y: bitmap.y,
        width: bitmap.width,
        height: bitmap.height,
        counts: [...bitmap.counts]
      },
      group: this.currentGroup,
      current: true
    })
    this._shapeLayer.current = this._shapeLayer.shapes.length - 1
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 将 SAM 的多个离散外轮廓分别保存为 Polygon。 */
  addPolygonContours(contours: Point[][]): void {
    if (!this._shapeLayer) return
    const valid = contours.filter((points) => points.length >= 3)
    if (valid.length === 0) return
    this._shapeLayer.shapes.forEach((shape) => {
      shape.current = false
    })
    valid.forEach((points) => {
      this._shapeLayer!.addShape({
        id: createShapeId(),
        type: 'polygon',
        points,
        complete: true,
        group: this.currentGroup,
        current: true
      })
    })
    this._shapeLayer.current = this._shapeLayer.shapes.length - 1
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 同步调整底图与标注 Canvas 的实际绘制尺寸。 */
  resizeCanvas(width: number, height: number): void {
    if (!this._imageLayer || !this._shapeLayer) return
    const nextWidth = Math.max(1, Math.floor(width))
    const nextHeight = Math.max(1, Math.floor(height))
    if (
      this._imageLayer.canvas.width === nextWidth &&
      this._imageLayer.canvas.height === nextHeight &&
      this._shapeLayer.canvas.width === nextWidth &&
      this._shapeLayer.canvas.height === nextHeight
    ) {
      return
    }
    this._imageLayer.canvas.width = nextWidth
    this._imageLayer.canvas.height = nextHeight
    this._shapeLayer.canvas.width = nextWidth
    this._shapeLayer.canvas.height = nextHeight
    this._imageLayer.redraw()
    this._shapeLayer.redraw()
  }

  /** 重置缩放为 1×，平移恢复 0，同时同步到 ImageLayer 和 ShapeLayer */
  resetZoom(): void {
    if (!this._shapeLayer) return
    this._viewport.reset()
  }

  /** 将完整图片等比缩放并居中到当前画布可用区域。 */
  fitImageToCanvas(): void {
    const image = this._imageLayer?.img
    const canvas = this._shapeLayer?.canvas
    if (!image || !canvas || image.width <= 0 || image.height <= 0) return
    const width = this._viewport.orientedWidth || image.width
    const height = this._viewport.orientedHeight || image.height
    const scale = Math.max(0.01, Math.min(canvas.width / width, canvas.height / height))
    this._viewport.setTransform(
      scale,
      (width - canvas.width / scale) / 2,
      (height - canvas.height / scale) / 2
    )
    this._notify()
  }

  /** 取消正在执行的聚焦动画 */
  private _cancelAnim(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  /**
   * 平滑聚焦到指定图形
   * @param shapeIdx - 图形在 shapes 中的索引
   */
  focusOnShape(shapeIdx: number): void {
    if (!this._shapeLayer || !this._imageLayer) return
    const shapeLayer = this._shapeLayer
    const shape = shapeLayer.shapes[shapeIdx]
    if (!shape) return

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    if (shape.type === 'rect' || shape.type === 'ellipse') {
      const hw = shape.w / 2,
        hh = shape.h / 2
      const cos = Math.cos(shape.rotation || 0),
        sin = Math.sin(shape.rotation || 0)
      for (const [dx, dy] of [
        [-hw, -hh],
        [hw, -hh],
        [-hw, hh],
        [hw, hh]
      ]) {
        const x = shape.x + dx * cos - dy * sin
        const y = shape.y + dx * sin + dy * cos
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    } else if (shape.type === 'point') {
      minX = maxX = shape.x
      minY = maxY = shape.y
    } else if (shape.type === 'mask') {
      minX = shape.bitmap.x
      minY = shape.bitmap.y
      maxX = shape.bitmap.x + shape.bitmap.width
      maxY = shape.bitmap.y + shape.bitmap.height
    } else if (shape.type === 'cuboid' && shape.points.length >= 2) {
      const vertices =
        shape.points.length >= 8 ? shape.points : cuboidVertices(shape.points[0], shape.points[1])
      for (const point of vertices) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
    } else if (shape.type === 'joint') {
      for (const point of placedJointPoints(shape)) {
        minX = Math.min(minX, point.x)
        maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y)
        maxY = Math.max(maxY, point.y)
      }
    } else {
      for (const p of shape.points) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }

    const orientedCorners = [
      this._viewport.toOriented(minX, minY),
      this._viewport.toOriented(maxX, minY),
      this._viewport.toOriented(maxX, maxY),
      this._viewport.toOriented(minX, maxY)
    ]
    const orientedX = orientedCorners.map((point) => point.x)
    const orientedY = orientedCorners.map((point) => point.y)
    const orientedMinX = Math.min(...orientedX)
    const orientedMaxX = Math.max(...orientedX)
    const orientedMinY = Math.min(...orientedY)
    const orientedMaxY = Math.max(...orientedY)
    const cx = (orientedMinX + orientedMaxX) / 2
    const cy = (orientedMinY + orientedMaxY) / 2
    const bw = orientedMaxX - orientedMinX || 10
    const bh = orientedMaxY - orientedMinY || 10
    const pad = 1.2

    const cw = shapeLayer.canvas.width
    const ch = shapeLayer.canvas.height
    const fitScale = Math.min(cw / (bw * pad), ch / (bh * pad))
    const targetScale = Math.max(0.01, fitScale)
    const targetTx = cx - cw / (2 * targetScale)
    const targetTy = cy - ch / (2 * targetScale)

    const startScale = this._viewport.scale
    const startTx = this._viewport.translateX
    const startTy = this._viewport.translateY

    this._cancelAnim()
    const duration = 400
    const start = performance.now()

    const step = (now: number) => {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      this._viewport.setTransform(
        startScale + (targetScale - startScale) * ease,
        startTx + (targetTx - startTx) * ease,
        startTy + (targetTy - startTy) * ease
      )
      if (t < 1) {
        this._rafId = requestAnimationFrame(step)
      } else {
        this._rafId = null
      }
    }

    this._rafId = requestAnimationFrame(step)
  }

  /** 撤销到上一个快照（越界时无操作，用 canUndo 预先判断） */
  undo(): void {
    if (this._historyIndex < 1) return
    this._historyIndex--
    this._restoreSnapshot()
  }

  /** 重做到下一个快照（越界时无操作，用 canRedo 预先判断） */
  redo(): void {
    if (this._historyIndex >= this._historyStack.length - 1) return
    this._historyIndex++
    this._restoreSnapshot()
  }

  /** 从历史栈当前索引恢复图形和交互模式快照 */
  _restoreSnapshot(): void {
    if (!this._shapeLayer) return
    const entry = this._historyStack[this._historyIndex]
    this._shapeLayer.shapes = deepCopy(entry.shapes)
    this._shapeLayer.current = this._shapeLayer.shapes.findIndex((s) => s.current)
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._maskPolygonPoints = []
    this._maskMergeStart = null
    this._shapeLayer.clearLivePath()

    const incomplete = this._shapeLayer.shapes.find(
      (s) =>
        (s.type === 'polygon' ||
          s.type === 'polyline' ||
          s.type === 'curve' ||
          s.type === 'cuboid' ||
          s.type === 'joint') &&
        !s.complete
    )
    if (incomplete) {
      this.interactionMode = 'draw'
      this.mode = incomplete.type
      this._shapeLayer.mode = incomplete.type
    } else {
      this.interactionMode = entry.interactionMode
      this.mode = entry.mode
      this._shapeLayer.mode = entry.mode
    }
    this._shapeLayer.interactionMode = this.interactionMode
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 清空所有图形（保存当前快照到历史栈，可撤销） */
  clear(): void {
    if (!this._shapeLayer) return
    this._shapeLayer.clearAll()
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._maskPolygonPoints = []
    this._maskMergeStart = null
    this._shapeLayer.clearLivePath()
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 是否可撤销
   * @returns historyIndex > 0 时 true
   */
  canUndo(): boolean {
    return this._historyIndex > 0
  }

  /**
   * 是否可重做
   * @returns historyIndex < 栈顶时 true
   */
  canRedo(): boolean {
    return this._historyIndex < this._historyStack.length - 1
  }

  /** 完成绘制中的多边形（>=3 个点），触发 _onPolygonComplete 回调 */
  completePolygon(): void {
    if (!this._shapeLayer) return
    const idx = this._shapeLayer.shapes.length - 1
    if (idx < 0) return
    const poly = this._shapeLayer.shapes[idx]
    if (poly.type !== 'polygon' || poly.complete) return
    if (poly.points.length < 3) return
    poly.complete = true
    this._shapeLayer.clearCursorPreview()
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    if (this._onPolygonComplete) this._onPolygonComplete(poly)
  }

  /**
   * 当前是否正在绘制多边形
   * @returns 有未 complete 的多边形时 true
   */
  isPolygonActive(): boolean {
    if (!this._shapeLayer) return false
    if (this.mode !== 'polygon') return false
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    return last && last.type === 'polygon' && !last.complete
  }

  /** 完成绘制中的折线（>=2 个点） */
  completePolyline(): void {
    if (!this._shapeLayer) return
    const idx = this._shapeLayer.shapes.length - 1
    if (idx < 0) return
    const pl = this._shapeLayer.shapes[idx]
    if (pl.type !== 'polyline' || pl.complete) return
    if (pl.points.length < 2) return
    pl.complete = true
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 当前是否正在绘制折线
   * @returns 有未 complete 的折线时 true
   */
  isPolylineActive(): boolean {
    if (!this._shapeLayer) return false
    if (this.mode !== 'polyline') return false
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    return last && last.type === 'polyline' && !last.complete
  }

  /** 完成绘制中的曲线（至少两个控制点）。 */
  completeCurve(): void {
    const curve = this._activeCurve()
    if (!curve || curve.points.length < 2) return
    curve.complete = true
    this._saveSnapshot()
    this._shapeLayer!.drawHistory()
    this._notify()
  }

  isCurveActive(): boolean {
    return this.mode === 'curve' && this._activeCurve() !== null
  }

  /** 提前完成人体骨架；尚未放置的关键点按缺失点保存。 */
  completeJoint(): void {
    const joint = this._activeJoint()
    if (!joint || placedJointPoints(joint).length === 0) return
    joint.complete = true
    joint.nextPointIndex = joint.points.length
    this._saveSnapshot()
    this._shapeLayer!.drawHistory()
    this._notify()
  }

  isJointActive(): boolean {
    return this.mode === 'joint' && this._activeJoint() !== null
  }

  getActiveJointProgress(): { index: number; total: number; name: string; placed: number } | null {
    const joint = this._activeJoint()
    if (!joint) return null
    return {
      index: joint.nextPointIndex,
      total: COCO_PERSON_KEYPOINTS.length,
      name: jointPointLabel(joint.nextPointIndex),
      placed: placedJointPoints(joint).length
    }
  }

  /** 将当前关键点记为缺失并继续到下一个关键点。 */
  skipJointPoint(): void {
    if (!this._shapeLayer || this.mode !== 'joint' || this.interactionMode !== 'draw') return
    let joint = this._activeJoint()
    if (!joint) {
      joint = {
        id: createShapeId(),
        type: 'joint',
        skeleton: 'coco-person-17',
        points: createCocoPersonPoints(),
        nextPointIndex: 0,
        complete: false,
        group: this.currentGroup
      }
      this._shapeLayer.addShape(joint)
    }
    joint.nextPointIndex = Math.min(joint.points.length, joint.nextPointIndex + 1)
    if (joint.nextPointIndex >= joint.points.length) {
      if (placedJointPoints(joint).length === 0) this._shapeLayer.popShape()
      else joint.complete = true
    }
    this._saveSnapshot()
    this._shapeLayer!.drawHistory()
    this._notify()
  }

  /** 丢弃当前未完成的连续图形或多边形 Mask 路径，不保留逐点历史。 */
  cancelCurrentDrawing(): boolean {
    if (!this._shapeLayer || this.interactionMode !== 'draw') return false
    const active =
      this._activePolygon() ||
      this._activePolyline() ||
      this._activeCurve() ||
      this._activeJoint() ||
      this._activeCuboid()
    let cancelled = false
    if (active) {
      const activeId = active.id
      this._shapeLayer.shapes.pop()
      this._historyStack.length = this._historyIndex + 1
      while (
        this._historyStack.length > 0 &&
        this._historyStack[this._historyStack.length - 1].shapes.some(
          (shape) => shape.id === activeId
        )
      ) {
        this._historyStack.pop()
      }
      this._historyIndex = this._historyStack.length - 1
      this._seedHistory()
      this._historyIndex = this._historyStack.length - 1
      cancelled = true
    }
    if (this._maskPolygonPoints.length > 0) {
      this._maskPolygonPoints = []
      cancelled = true
    }
    if (this._state.drawing) cancelled = true
    if (!cancelled) return false
    this._state.drawing = false
    this._state.dragIdx = -1
    this._state.dragStart = null
    this._state.drawStart = null
    this._maskLastPoint = null
    this._shapeLayer.clearCursorPreview()
    this._shapeLayer.clearLivePath()
    this._shapeLayer.clearLiveRect()
    this._shapeLayer.clearLiveEllipse()
    this._shapeLayer.clearLiveCuboid()
    this._shapeLayer.current = this._shapeLayer.shapes.findIndex((shape) => shape.current)
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /**
   * 完成立方体标注。
   */
  completeCuboid(): void {
    const cuboid = this._activeCuboid()
    if (!cuboid || cuboid.points.length < 2) return
    cuboid.complete = true
    this._saveSnapshot()
    this._shapeLayer!.drawHistory()
    this._notify()
  }

  /** 当前是否正在绘制立方体。 */
  isCuboidActive(): boolean {
    return this.mode === 'cuboid' && this._activeCuboid() !== null
  }

  /**
   * 获取当前选中的图形
   * @returns shapes 中 current 指向的图形浅引用，无选中时 null
   */
  getSelectedShape(): Shape | null {
    if (!this._shapeLayer) return null
    const idx = this._shapeLayer.current
    if (idx >= 0 && idx < this._shapeLayer.shapes.length) {
      return this._shapeLayer.shapes[idx]
    }
    return null
  }

  /**
   * 根据 name 获取分组配置
   * @param name - 分组名称
   * @returns 分组配置，不存在则 undefined
   */
  getGroup(name: string): Group | undefined {
    return this._groupMap[name]
  }

  /**
   * 修改当前选中图形的分组
   * @param color - 目标分组 name
   */
  setSelectedShapeGroup(color: string): void {
    if (!this._shapeLayer) return
    if (!this._groupMap[color]) return
    const selected = this._shapeLayer.shapes.filter((shape) => shape.current)
    if (selected.length > 0) {
      selected.forEach((shape) => {
        shape.group = color
      })
      this._saveSnapshot()
      this._shapeLayer.drawHistory()
      this._notify()
    }
  }

  /** 切换单个标注的画布可见性；隐藏不影响保存或导出。 */
  toggleShapeVisibility(index: number): void {
    if (!this._shapeLayer || index < 0 || index >= this._shapeLayer.shapes.length) return
    const shape = this._shapeLayer.shapes[index]
    shape.hidden = !shape.hidden
    if (shape.hidden && shape.current) {
      shape.current = false
      if (this._shapeLayer.current === index) {
        this._shapeLayer.current = this._shapeLayer.shapes.findIndex(
          (candidate) => candidate.current && !candidate.hidden
        )
      }
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 一次隐藏或显示全部标注。 */
  setAllShapesVisibility(hidden: boolean): void {
    if (!this._shapeLayer) return
    this._shapeLayer.shapes.forEach((shape) => {
      shape.hidden = hidden
      if (hidden) shape.current = false
    })
    if (hidden) {
      this._shapeLayer.current = -1
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 批量设置指定索引标注的可见性，供筛选列表操作使用。 */
  setShapesVisibility(indices: number[], hidden: boolean): void {
    if (!this._shapeLayer) return
    const targets = new Set(
      indices.filter((index) => index >= 0 && index < this._shapeLayer!.shapes.length)
    )
    if (targets.size === 0) return
    targets.forEach((index) => {
      this._shapeLayer!.shapes[index].hidden = hidden
      if (hidden) this._shapeLayer!.shapes[index].current = false
    })
    if (hidden && targets.has(this._shapeLayer.current)) {
      this._shapeLayer.current = this._shapeLayer.shapes.findIndex(
        (candidate) => candidate.current && !candidate.hidden
      )
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /** 删除当前选中的图形（保存快照，可撤销） */
  deleteSelected(): void {
    if (!this._shapeLayer) return
    const selected = this._shapeLayer.shapes.filter((shape) => shape.current)
    if (selected.length === 0) return
    this._shapeLayer.shapes = this._shapeLayer.shapes.filter((shape) => !shape.current)
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._saveSnapshot()
    this._shapeLayer.current = -1
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 按索引选中图形（取消其他图形的选中状态）
   * @param idx - 图形索引，超出范围则取消所有选中
   */
  selectShapeByIndex(idx: number): void {
    if (!this._shapeLayer) return
    if (idx >= 0 && idx < this._shapeLayer.shapes.length) {
      this._selectOnly(idx)
    } else {
      this._shapeLayer.shapes.forEach((shape) => {
        shape.current = false
      })
      this._shapeLayer.current = -1
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    this._shapeLayer.drawHistory()
    this._notify()
  }

  /**
   * 通过画布像素坐标选中图形
   * @param pixelX - 画布 X 坐标
   * @param pixelY - 画布 Y 坐标
   */
  selectShape(pixelX: number, pixelY: number): void {
    if (!this._shapeLayer) return
    this._shapeLayer.shapes.forEach((s) => {
      s.current = false
    })
    const idx = this._shapeLayer.hitTest(pixelX, pixelY)
    if (idx >= 0) {
      this._shapeLayer.shapes[idx].current = true
      this._shapeLayer.current = idx
    } else {
      this._shapeLayer.current = -1
    }
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._shapeLayer.drawHistory()
    this._saveSnapshot()
  }

  /**
   * 获取所有图形的深拷贝
   * @returns 全部图形的深拷贝数组
   */
  getShapes(): Shape[] {
    if (!this._shapeLayer) return []
    return this._shapeLayer.shapes.map((s) => deepCopy(s))
  }

  /**
   * 获取当前视图元数据
   * @returns { scale, translateX, translateY, mode, group }
   */
  getMeta(): Meta {
    if (!this._shapeLayer) {
      return {
        scale: 1,
        translateX: 0,
        translateY: 0,
        mode: this.mode,
        group: this.currentGroup,
        imageAdjustments: { ...this.imageAdjustments },
        showLabels: true,
        showGrid: true,
        showCrosshair: true,
        rotation: this._viewport.rotation
      }
    }
    return {
      scale: this._viewport.scale,
      translateX: this._viewport.translateX,
      translateY: this._viewport.translateY,
      mode: this.mode,
      group: this.currentGroup,
      maskTool: this.maskTool,
      maskBrushSize: this.maskBrushSize,
      imageAdjustments: { ...this.imageAdjustments },
      showLabels: this._shapeLayer.showLabels,
      showGrid: this._shapeLayer.showGrid,
      showCrosshair: this._shapeLayer.showCrosshair,
      rotation: this._viewport.rotation
    }
  }

  /**
   * 获取 shapes 末尾的最后一个图形（绘制中的折线/多边形）
   * @returns 末尾图形，空时 undefined
   */
  getLastShape(): Shape | undefined {
    if (!this._shapeLayer) return undefined
    return this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
  }

  /** 标注对象只接受当前数据模型；Mask 必须直接提供最终 bitmap。 */
  _normalizeShapes(shapes: Shape[]): Shape[] {
    return ensureShapeIds(deepCopy(shapes))
      .map((shape) => (shape.type === 'joint' ? normalizeCocoPersonJoint(shape) : shape))
      .filter((shape) => {
        if (shape.type !== 'mask') return true
        const bitmap = (shape as MaskShape).bitmap
        return (
          !!bitmap &&
          Number.isFinite(bitmap.x) &&
          Number.isFinite(bitmap.y) &&
          Number.isInteger(bitmap.width) &&
          bitmap.width >= 0 &&
          Number.isInteger(bitmap.height) &&
          bitmap.height >= 0 &&
          Array.isArray(bitmap.counts)
        )
      })
  }

  /**
   * 替换全部图形（深拷贝），重置历史栈为仅当前状态
   * @param shapes - 新的图形数组
   */
  setShapes(shapes: Shape[]): void {
    if (!this._shapeLayer) return
    this._shapeLayer.shapes = this._normalizeShapes(shapes)
    this._shapeLayer.current = this._shapeLayer.shapes.findIndex((s) => s.current)
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this._maskPolygonPoints = []
    this._maskMergeStart = null
    this._shapeLayer.clearLivePath()
    this._shapeLayer.drawHistory()
    this._resetHistoryToCurrent()
  }

  /** 确保历史栈不为空（供外部初始化无操作时调用，避免 undo/redo 异常） */
  seedHistory(): void {
    this._seedHistory()
  }

  /* ---- Internal ---- */

  /** 触发 onChange 回调（同步，立即执行） */
  _notify(): void {
    this.onChange(this.getShapes(), this.getMeta())
  }

  /** 触发 onChange 回调（通过 rAF 去抖，用于高频调用场景如拖拽中） */
  _liveNotify(): void {
    if (this._notifyRafId !== null) return
    this._notifyRafId = requestAnimationFrame(() => {
      this._notifyRafId = null
      this.onChange(this.getShapes(), this.getMeta())
    })
  }

  /** 保存当前图形快照到历史栈（上限 100） */
  _saveSnapshot(): void {
    if (!this._shapeLayer) return
    if (this._historyIndex < this._historyStack.length - 1) {
      this._historyStack.length = this._historyIndex + 1
    }
    this._historyStack.push({
      shapes: deepCopy(this._shapeLayer.shapes),
      interactionMode: this.interactionMode,
      mode: this.mode
    })
    if (this._historyStack.length > 100) this._historyStack.shift()
    this._historyIndex = this._historyStack.length - 1
  }

  /** 确保初始快照存在（历史栈为空时写入） */
  _seedHistory(): void {
    if (!this._shapeLayer) return
    if (this._historyStack.length === 0) {
      this._historyStack.push({
        shapes: deepCopy(this._shapeLayer.shapes),
        interactionMode: this.interactionMode,
        mode: this.mode
      })
      this._historyIndex = 0
    }
  }

  /** 重置历史栈为仅包含当前状态（清空 undo/redo 历史） */
  _resetHistoryToCurrent(): void {
    if (!this._shapeLayer) return
    this._historyStack = [
      {
        shapes: deepCopy(this._shapeLayer.shapes),
        interactionMode: this.interactionMode,
        mode: this.mode
      }
    ]
    this._historyIndex = 0
  }

  /**
   * 根据鼠标位置和交互状态更新画布光标样式
   * draw 模式：crosshair；矩形手柄：resize/grab；图形上方：move/pointer
   * @param e - 鼠标事件
   */
  _setCursor(e: MouseEvent): void {
    if (!this._shapeLayer) return
    const canvas = this._shapeLayer.canvas
    if (this.interactionMode === 'draw') {
      canvas.style.cursor = 'crosshair'
      return
    }
    const s =
      this._shapeLayer.current >= 0 ? this._shapeLayer.shapes[this._shapeLayer.current] : null
    if (s && (s.type === 'rect' || s.type === 'ellipse')) {
      const h = this._shapeLayer.handleHit(e.offsetX, e.offsetY, true)
      const cursors: Record<string, string> = {
        TL: 'nwse-resize',
        BR: 'nwse-resize',
        TR: 'nesw-resize',
        BL: 'nesw-resize',
        T: 'ns-resize',
        B: 'ns-resize',
        L: 'ew-resize',
        R: 'ew-resize',
        ROTATE: 'grab'
      }
      if (cursors[h]) {
        canvas.style.cursor = cursors[h]
        return
      }
      if (this._shapeLayer.hitTest(e.offsetX, e.offsetY) >= 0) {
        canvas.style.cursor = 'move'
        return
      }
    }
    if (this._shapeLayer.hitTest(e.offsetX, e.offsetY) >= 0) {
      canvas.style.cursor = 'pointer'
      return
    }
    canvas.style.cursor = 'crosshair'
  }

  /* ---- Polygon helpers ---- */

  /**
   * 获取当前绘制中的多边形
   * @returns 最后一个未 complete 的 polygon，无则 null
   */
  _activePolygon(): PolygonShape | null {
    if (!this._shapeLayer) return null
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    if (last && last.type === 'polygon' && !last.complete) return last as PolygonShape
    return null
  }

  /**
   * 获取当前绘制中的折线
   * @returns 最后一个未 complete 的 polyline，无则 null
   */
  _activePolyline(): PolylineShape | null {
    if (!this._shapeLayer) return null
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    if (last && last.type === 'polyline' && !last.complete) return last as PolylineShape
    return null
  }

  _activeCurve(): CurveShape | null {
    if (!this._shapeLayer) return null
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    if (last && last.type === 'curve' && !last.complete) return last
    return null
  }

  _activeJoint(): JointShape | null {
    if (!this._shapeLayer) return null
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    if (last && last.type === 'joint' && !last.complete) return last
    return null
  }

  /** 将旋转矩形按四个实际角点无损转为多边形。 */
  _convertRectToPolygon(index: number): PolygonShape | null {
    if (!this._shapeLayer) return null
    const shape = this._shapeLayer.shapes[index]
    if (shape?.type === 'polygon') return shape
    if (shape?.type !== 'rect') return null
    const polygon: PolygonShape = {
      id: shape.id,
      type: 'polygon',
      points: rectVertices(shape),
      complete: true,
      group: shape.group,
      current: shape.current,
      hidden: shape.hidden
    }
    this._shapeLayer.shapes[index] = polygon
    return polygon
  }

  /** 获取明确选中并锁定的 Mask；未选中时仅在 paint 操作开始时新建。 */
  _maskForCurrentGroup(create = false): { shape: MaskShape; index: number } | null {
    if (!this._shapeLayer) return null
    if (this._maskAppendLocked && this._activeMaskIndex !== null) {
      const active = this._shapeLayer.shapes[this._activeMaskIndex]
      if (active?.type === 'mask') return { shape: active, index: this._activeMaskIndex }
      this._activeMaskIndex = null
      this._maskAppendLocked = false
    }
    if (!create) return null
    const shape: MaskShape = {
      id: createShapeId(),
      type: 'mask',
      bitmap: emptyMaskBitmap(),
      group: this.currentGroup
    }
    this._shapeLayer.addShape(shape)
    this._activeMaskIndex = this._shapeLayer.shapes.length - 1
    this._maskAppendLocked = false
    return { shape, index: this._activeMaskIndex }
  }

  _maskHitTest(pixelX: number, pixelY: number): number {
    if (!this._shapeLayer) return -1
    const point = this._viewport.toImage(pixelX, pixelY)
    for (let index = this._shapeLayer.shapes.length - 1; index >= 0; index--) {
      const shape = this._shapeLayer.shapes[index]
      if (shape.type === 'mask' && !shape.hidden && maskBitmapContains(shape.bitmap, point)) {
        return index
      }
    }
    return -1
  }

  _selectMaskTargetAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    const hitIndex = this._maskHitTest(pixelX, pixelY)
    const index =
      hitIndex >= 0 && this._maskAppendLocked && this._activeMaskIndex === hitIndex ? -1 : hitIndex
    this._shapeLayer.shapes.forEach((shape) => {
      shape.current = false
    })
    this._activeMaskIndex = index >= 0 ? index : null
    this._maskAppendLocked = index >= 0
    this._shapeLayer.current = index
    if (index >= 0) {
      const shape = this._shapeLayer.shapes[index] as MaskShape
      shape.current = true
      this.currentGroup = shape.group
      this._shapeLayer._group = shape.group
    }
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  _maskPolygonAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    if (this.maskTool === 'inverse-polygon' && !this.hasActiveMaskTarget()) return true
    const point = this._viewport.toImage(pixelX, pixelY)
    if (this._maskPolygonPoints.length === 0) {
      this._maskPolygonPoints = [point]
      this._shapeLayer.drawLivePath(this._maskPolygonPoints, this.currentGroup)
      this._notify()
      return true
    }
    const first = this._viewport.toCanvas(
      this._maskPolygonPoints[0].x,
      this._maskPolygonPoints[0].y
    )
    const closes =
      this._maskPolygonPoints.length >= 3 && Math.hypot(pixelX - first.x, pixelY - first.y) <= 8
    if (!closes) {
      this._maskPolygonPoints.push(point)
      this._shapeLayer.drawLivePath(this._maskPolygonPoints, this.currentGroup)
      this._notify()
      return true
    }

    const wasLocked = this._maskAppendLocked
    const target = this._maskForCurrentGroup(this.maskTool === 'polygon')
    if (target) {
      target.shape.bitmap = applyMaskOperation(
        target.shape.bitmap,
        {
          kind: 'polygon',
          operation: this.maskTool === 'polygon' ? 'paint' : 'subtract',
          points: this._maskPolygonPoints
        },
        this.getImageSize()
      )
      if (target.shape.bitmap.width === 0 || target.shape.bitmap.height === 0) {
        this._shapeLayer.shapes.splice(target.index, 1)
        this._shapeLayer.current = -1
        this._activeMaskIndex = null
        this._maskAppendLocked = false
      } else if (!wasLocked) {
        this._activeMaskIndex = null
      }
      this._saveSnapshot()
    }
    this._maskPolygonPoints = []
    this._shapeLayer.clearLivePath()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  _mergeMasksAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    const hitIndex = this._maskHitTest(pixelX, pixelY)
    if (hitIndex < 0) return true
    if (this._maskMergeStart === null) {
      this._maskMergeStart = hitIndex
      this._shapeLayer.shapes.forEach((shape) => {
        shape.current = false
      })
      this._shapeLayer.shapes[hitIndex].current = true
      this._shapeLayer.current = hitIndex
      this._shapeLayer.drawHistory()
      this._notify()
      return true
    }
    const firstIndex = this._maskMergeStart
    if (firstIndex === hitIndex) return true
    const first = this._shapeLayer.shapes[firstIndex]
    const second = this._shapeLayer.shapes[hitIndex]
    if (first?.type !== 'mask' || second?.type !== 'mask') {
      this._maskMergeStart = null
      return true
    }
    first.bitmap = mergeMaskBitmaps([first.bitmap, second.bitmap])
    first.current = true
    this._shapeLayer.shapes.splice(hitIndex, 1)
    const keepIndex = hitIndex < firstIndex ? firstIndex - 1 : firstIndex
    this._shapeLayer.shapes.forEach((shape, index) => {
      shape.current = index === keepIndex
    })
    this._shapeLayer.current = keepIndex
    this._maskMergeStart = null
    this._activeMaskIndex = null
    this._maskAppendLocked = false
    this.maskTool = 'brush'
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /** 获取当前绘制中的立方体。 */
  _activeCuboid(): CuboidShape | null {
    if (!this._shapeLayer) return null
    const last = this._shapeLayer.shapes[this._shapeLayer.shapes.length - 1]
    if (last && last.type === 'cuboid' && !last.complete) return last
    return null
  }

  /** 从顶层向下查找可编辑路径边缘。 */
  _findEditableEdge(pixelX: number, pixelY: number) {
    if (!this._shapeLayer) return null
    for (let shapeIdx = this._shapeLayer.shapes.length - 1; shapeIdx >= 0; shapeIdx--) {
      const projection = this._shapeLayer.findEdgeProjection(pixelX, pixelY, shapeIdx)
      if (projection) return { shapeIdx, ...projection }
    }
    return null
  }

  _findPolygonEdge(pixelX: number, pixelY: number) {
    if (!this._shapeLayer) return null
    for (let shapeIdx = this._shapeLayer.shapes.length - 1; shapeIdx >= 0; shapeIdx--) {
      const shape = this._shapeLayer.shapes[shapeIdx]
      if (shape.type !== 'polygon' || !shape.complete) continue
      const projection = this._shapeLayer.findEdgeProjection(pixelX, pixelY, shapeIdx)
      if (projection) return { shapeIdx, ...projection }
    }
    return null
  }

  _selectOnly(shapeIdx: number): void {
    if (!this._shapeLayer) return
    this._shapeLayer.shapes.forEach((shape) => {
      shape.current = false
    })
    this._shapeLayer.shapes[shapeIdx].current = true
    this._shapeLayer.current = shapeIdx
    this._activeMaskIndex = null
    this._maskAppendLocked = false
  }

  /** 辅助工具：在命中的折线或多边形边上增加顶点。 */
  _addVertexAt(pixelX: number, pixelY: number): boolean {
    const hit = this._findEditableEdge(pixelX, pixelY)
    if (!hit || !this._shapeLayer) return false
    const shape = this._shapeLayer.shapes[hit.shapeIdx]
    if (shape.type !== 'polyline' && shape.type !== 'polygon') return false
    shape.points.splice(hit.insertIdx, 0, hit.point)
    this._selectOnly(hit.shapeIdx)
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /** 辅助工具：删除命中的路径顶点，同时守住有效路径的最小点数。 */
  _deleteVertexAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    const hit = this._shapeLayer.vertexHitTest(pixelX, pixelY)
    if (!hit) return false
    const shape = this._shapeLayer.shapes[hit.shapeIdx]
    if (shape.type !== 'polyline' && shape.type !== 'polygon') return false
    const minimum = shape.type === 'polygon' ? 3 : 2
    if (shape.points.length <= minimum) return false
    shape.points.splice(hit.vertexIdx, 1)
    this._selectOnly(hit.shapeIdx)
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /**
   * 辅助工具：从路径边缘开始、在图形内部添加任意折线路径点，再于边缘结束。
   * 裁剪只拆分对象，不丢弃任何一部分；新拆出的对象使用独立 UUID。
   */
  _clipPathAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    if (!this._pathClipStart) {
      const hit = this._findEditableEdge(pixelX, pixelY)
      if (!hit) return false
      const shape = this._shapeLayer.shapes[hit.shapeIdx]
      if (shape.type !== 'polyline' && shape.type !== 'polygon') return false
      this._pathClipStart = {
        shapeIdx: hit.shapeIdx,
        edgeIdx: hit.edgeIdx,
        ratio: hit.ratio,
        point: hit.point,
        points: [hit.point]
      }
      this._selectOnly(hit.shapeIdx)
      this._shapeLayer.drawLivePath(this._pathClipStart.points, shape.group)
      this._notify()
      return true
    }

    const start = this._pathClipStart
    const shape = this._shapeLayer.shapes[start.shapeIdx]
    if (shape?.type !== 'polyline' && shape?.type !== 'polygon') {
      this._pathClipStart = null
      this._shapeLayer.clearLivePath()
      return false
    }
    const hit = this._shapeLayer.findEdgeProjection(pixelX, pixelY, start.shapeIdx)
    const sameAnchor =
      hit && hit.edgeIdx === start.edgeIdx && Math.abs(hit.ratio - start.ratio) < 0.01

    if (!hit || sameAnchor) {
      const point = this._viewport.toImage(pixelX, pixelY)
      if (!sameAnchor && shape.type === 'polygon' && pointInPolygon(point, shape.points) === 1) {
        start.points.push(point)
        this._shapeLayer.drawLivePath(start.points, shape.group)
        this._notify()
      }
      return true
    }

    const firstCut = {
      edgeIdx: start.edgeIdx,
      ratio: start.ratio,
      point: start.point
    }
    const secondCut = { edgeIdx: hit.edgeIdx, ratio: hit.ratio, point: hit.point }

    if (shape.type === 'polyline') {
      const parts = splitPolylineAtCuts(shape.points, firstCut, secondCut)
      if (parts.length < 2) return true
      const replacements: PolylineShape[] = parts.map((points, index) => ({
        id: index === 0 ? shape.id : createShapeId(),
        type: 'polyline',
        points,
        complete: true,
        group: shape.group,
        hidden: shape.hidden,
        current: index === 0
      }))
      this._shapeLayer.shapes.splice(start.shapeIdx, 1, ...replacements)
    } else {
      const cutPath = [...start.points, hit.point]
      const parts = splitPolygonWithPath(shape.points, firstCut, secondCut, cutPath)
      if (parts.length < 2) return true
      const replacements: PolygonShape[] = parts.map((points, index) => ({
        id: index === 0 ? shape.id : createShapeId(),
        type: 'polygon',
        points,
        complete: true,
        group: shape.group,
        hidden: shape.hidden,
        current: index === 0
      }))
      this._shapeLayer.shapes.splice(start.shapeIdx, 1, ...replacements)
    }

    this._pathClipStart = null
    this._shapeLayer.clearLivePath()
    this._selectOnly(start.shapeIdx)
    this.auxiliaryTool = 'move'
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /** 用连续点击生成的新路径替换多边形两锚点间较短的原边界。 */
  _reshapePathAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    if (!this._pathReshape) {
      const start = this._findPolygonEdge(pixelX, pixelY)
      if (!start) return false
      this._pathReshape = {
        shapeIdx: start.shapeIdx,
        start: { edgeIdx: start.edgeIdx, ratio: start.ratio, point: start.point },
        points: [start.point]
      }
      this._selectOnly(start.shapeIdx)
      const shape = this._shapeLayer.shapes[start.shapeIdx]
      this._shapeLayer.drawLivePath(this._pathReshape.points, shape.group)
      this._notify()
      return true
    }

    const state = this._pathReshape
    const shape = this._shapeLayer.shapes[state.shapeIdx]
    if (shape?.type !== 'polygon') {
      this._pathReshape = null
      this._shapeLayer.clearLivePath()
      return false
    }
    const end = this._shapeLayer.findEdgeProjection(pixelX, pixelY, state.shapeIdx)
    const sameAnchor =
      end && end.edgeIdx === state.start.edgeIdx && Math.abs(end.ratio - state.start.ratio) < 0.01

    // 中途点完全可选且不受多边形内外限制；命中另一锚点时立即完成直连替换。
    if (!end || sameAnchor) {
      state.points.push(this._viewport.toImage(pixelX, pixelY))
      this._shapeLayer.drawLivePath(state.points, shape.group)
      this._notify()
      return true
    }

    const cuts = [
      {
        edgeIdx: state.start.edgeIdx,
        ratio: state.start.ratio,
        point: state.start.point,
        marker: 'start' as const
      },
      {
        edgeIdx: end.edgeIdx,
        ratio: end.ratio,
        point: end.point,
        marker: 'end' as const
      }
    ]
    const augmented: { point: Point; marker?: 'start' | 'end' }[] = []
    for (let index = 0; index < shape.points.length; index++) {
      augmented.push({ point: shape.points[index] })
      cuts
        .filter((cut) => cut.edgeIdx === index)
        .sort((left, right) => left.ratio - right.ratio)
        .forEach((cut) => augmented.push({ point: cut.point, marker: cut.marker }))
    }
    const startIndex = augmented.findIndex((entry) => entry.marker === 'start')
    const endIndex = augmented.findIndex((entry) => entry.marker === 'end')
    if (startIndex < 0 || endIndex < 0) return true

    const forward = (from: number, to: number): Point[] => {
      const points: Point[] = []
      let index = from
      for (let guard = 0; guard <= augmented.length; guard++) {
        points.push(augmented[index].point)
        if (index === to) break
        index = (index + 1) % augmented.length
      }
      return withoutAdjacentDuplicates(points)
    }
    const originalStartToEnd = forward(startIndex, endIndex)
    const originalEndToStart = forward(endIndex, startIndex)
    const middle = state.points.slice(1)
    shape.points =
      pathLength(originalStartToEnd) <= pathLength(originalEndToStart)
        ? withoutAdjacentDuplicates([...originalEndToStart, ...middle])
        : withoutAdjacentDuplicates([...originalStartToEnd, ...middle.reverse()])

    this._pathReshape = null
    this._shapeLayer.clearLivePath()
    this._selectOnly(state.shapeIdx)
    this.auxiliaryTool = 'move'
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /** 辅助工具：依次点击两个多边形或矩形，生成几何并集并沿用首选分组。 */
  _mergePolygonsAt(pixelX: number, pixelY: number): boolean {
    if (!this._shapeLayer) return false
    const imagePoint = this._viewport.toImage(pixelX, pixelY)
    let hitIdx = -1
    for (let index = this._shapeLayer.shapes.length - 1; index >= 0; index--) {
      const shape = this._shapeLayer.shapes[index]
      if (shape.hidden || (shape.type !== 'polygon' && shape.type !== 'rect')) continue
      const points = shape.type === 'rect' ? rectVertices(shape) : shape.points
      if ((shape.type === 'rect' || shape.complete) && pointInPolygon(imagePoint, points) !== 0) {
        hitIdx = index
        break
      }
    }
    if (hitIdx < 0) return false
    const converted = this._shapeLayer.shapes[hitIdx].type === 'rect'
    if (converted) this._convertRectToPolygon(hitIdx)

    if (this._polygonMergeStart === null) {
      this._polygonMergeStart = hitIdx
      this._selectOnly(hitIdx)
      if (converted) this._saveSnapshot()
      this._shapeLayer.drawHistory()
      this._notify()
      return true
    }

    const firstIdx = this._polygonMergeStart
    if (firstIdx === hitIdx) return true
    const first = this._shapeLayer.shapes[firstIdx]
    const second = this._shapeLayer.shapes[hitIdx]
    if (first?.type !== 'polygon' || second?.type !== 'polygon') {
      this._polygonMergeStart = null
      return true
    }
    const mergedPoints = unionPolygons(first.points, second.points)
    if (!mergedPoints) {
      if (converted) this._saveSnapshot()
      this._shapeLayer.drawHistory()
      this._notify()
      return true
    }

    const keepIdx = Math.min(firstIdx, hitIdx)
    const removeIdx = Math.max(firstIdx, hitIdx)
    this._shapeLayer.shapes[keepIdx] = {
      id: first.id,
      type: 'polygon',
      points: mergedPoints,
      complete: true,
      group: first.group,
      current: true
    }
    this._shapeLayer.shapes.splice(removeIdx, 1)
    this._polygonMergeStart = null
    this._selectOnly(keepIdx)
    this.auxiliaryTool = 'move'
    this._saveSnapshot()
    this._shapeLayer.drawHistory()
    this._notify()
    return true
  }

  /* ---- Event handlers ---- */

  /** 绑定鼠标事件处理器（返回解绑所需的引用），注册 mousedown/mousemove/mouseup/mouseout/wheel */
  _bindHandlers(): HandlerReturn {
    this._seedHistory()
    if (!this._shapeLayer) throw new Error('ShapeLayer not initialized')
    this._shapeLayer._groups = this._groupMap
    const self = this

    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 2) {
        self._state.panning = true
        self._state.panStart = { x: e.offsetX, y: e.offsetY }
        return
      }
      if (e.button !== 0) return

      if (self.interactionMode === 'draw' && self.mode === 'joint' && e.detail >= 2) return

      const handle = self._shapeLayer!.handleHit(e.offsetX, e.offsetY)

      if (self.readonly) {
        if (handle === 'OUT') {
          let hitIdx2 = self._shapeLayer!.hitTest(e.offsetX, e.offsetY)
          self._shapeLayer!.shapes.forEach((s) => {
            s.current = false
          })
          if (hitIdx2 >= 0) {
            self._shapeLayer!.shapes[hitIdx2].current = true
            self._shapeLayer!.current = hitIdx2
          } else {
            self._shapeLayer!.current = -1
          }
          self._shapeLayer!.drawHistory()
          self._notify()
        }
        return
      }

      if ((self._temporarySelect || e.ctrlKey) && self.mode === 'mask') {
        self._selectMaskTargetAt(e.offsetX, e.offsetY)
        return
      }

      if (self.interactionMode === 'draw' && self.mode === 'mask') {
        const imagePoint = self._viewport.toImage(e.offsetX, e.offsetY)
        if (self.maskTool === 'merge') {
          self._mergeMasksAt(e.offsetX, e.offsetY)
          return
        }
        if (self.maskTool === 'polygon' || self.maskTool === 'inverse-polygon') {
          self._maskPolygonAt(e.offsetX, e.offsetY)
          return
        }
        if (self.maskTool === 'eraser' && !self.hasActiveMaskTarget()) return
        self._state.drawing = true
        self._state.dragStart = { x: e.offsetX, y: e.offsetY }
        const target = self._maskForCurrentGroup(self.maskTool === 'brush')
        if (!target) {
          self._state.drawing = false
          return
        }
        const operation: MaskOperation = {
          kind: 'stroke',
          operation: self.maskTool === 'eraser' ? 'erase' : 'paint',
          points: [imagePoint],
          size: self.maskBrushSize
        }
        target.shape.bitmap = applyMaskOperation(
          target.shape.bitmap,
          operation,
          self.getImageSize()
        )
        self._maskLastPoint = imagePoint
        self._state.dragIdx = target.index
        self._shapeLayer!.drawHistory()
        self._liveNotify()
        return
      }

      if (self.interactionMode === 'select' && e.shiftKey) {
        if (self._deleteVertexAt(e.offsetX, e.offsetY)) return
      }

      if (self.interactionMode === 'select' && self.auxiliaryTool !== 'move') {
        const handled =
          self.auxiliaryTool === 'reshape-path'
            ? self._reshapePathAt(e.offsetX, e.offsetY)
            : self.auxiliaryTool === 'clip-path'
              ? self._clipPathAt(e.offsetX, e.offsetY)
              : self._mergePolygonsAt(e.offsetX, e.offsetY)
        if (handled) return
      }

      if (handle === 'ROTATE') {
        self._state.rotating = true
        const s = self._shapeLayer!.shapes[self._shapeLayer!.current] as RectShape
        const img = self._viewport.toImage(e.offsetX, e.offsetY)
        const handleAngle = s.rotation - Math.PI / 2
        const clickAngle = Math.atan2(img.y - s.y, img.x - s.x)
        self._state.rotateStartAngle = clickAngle
        self._state.rotateCache = { rotation: s.rotation }
        self._state.offsetAngle = normalizeAngle(clickAngle - handleAngle)
        return
      }
      if (handle !== 'OUT' && !self._state.drawing && !self._state.dragging) {
        self._state.resizing = true
        self._state.resizeDirection = handle
        const s = self._shapeLayer!.shapes[self._shapeLayer!.current] as RectShape
        self._state.resizeCache = { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation }
        const img = self._viewport.toImage(e.offsetX, e.offsetY)
        self._state.resizeStartLocal = self._shapeLayer!._toLocal(img.x, img.y, s)
        return
      }

      let hitIdx = -1
      let vertexIdx = -1
      self._state.dragFaceVertexIndices = null

      if (self.interactionMode === 'draw') {
        const poly =
          self._activePolygon() ||
          self._activePolyline() ||
          self._activeCurve() ||
          self._activeJoint() ||
          self._activeCuboid()
        if (poly && poly.points.length > 0) {
          const pts = poly.points
          for (let j = 0; j < pts.length; j++) {
            if (poly.type === 'joint' && poly.points[j].visibility === 0) continue
            const p = self._viewport.toCanvas(pts[j].x, pts[j].y)
            if (Math.hypot(e.offsetX - p.x, e.offsetY - p.y) <= 6) {
              hitIdx = self._shapeLayer!.shapes.length - 1
              vertexIdx = j
              break
            }
          }

          // 多边形已有三个顶点时，点击首个顶点应优先闭合绘图，
          // 不能继续落入通用的顶点拖拽逻辑。
          if (poly.type === 'polygon' && poly.points.length >= 3 && vertexIdx === 0) {
            self._state.drawing = false
            self.completePolygon()
            return
          }
        }
      } else {
        const vhit = self._shapeLayer!.vertexHitTest(e.offsetX, e.offsetY)
        if (vhit) {
          hitIdx = vhit.shapeIdx
          vertexIdx = vhit.vertexIdx
        } else {
          const faceHit = self._shapeLayer!.cuboidFaceHitTest(e.offsetX, e.offsetY)
          if (faceHit) {
            hitIdx = faceHit.shapeIdx
            self._state.dragFaceVertexIndices = faceHit.vertexIndices
          } else {
            hitIdx = self._shapeLayer!.hitTest(e.offsetX, e.offsetY)
          }
        }
      }
      if (e.ctrlKey && self.interactionMode === 'select' && !self._temporarySelect) {
        if (self._addVertexAt(e.offsetX, e.offsetY)) return
      }
      if (hitIdx >= 0) {
        self._selectOnly(hitIdx)

        self._state.dragging = true
        self._state.dragIdx = hitIdx
        self._state.dragVertexIdx = vertexIdx
        self._state.dragStart = { x: e.offsetX, y: e.offsetY }
        self._state.dragCache = deepCopy(self._shapeLayer!.shapes[hitIdx]) as DragCache
        self._shapeLayer!.drawHistory()
        self._notify()
        return
      }

      if (self.interactionMode !== 'draw') {
        self._shapeLayer!.shapes.forEach((shape) => {
          shape.current = false
        })
        self._shapeLayer!.current = -1
        self._activeMaskIndex = null
        self._maskAppendLocked = false
        self._state.selecting = true
        self._state.selectStart = { x: e.offsetX, y: e.offsetY }
        self._shapeLayer!.drawSelectionBox(self._state.selectStart, self._state.selectStart)
        return
      }

      self._state.drawing = true
      const imgPt = self._viewport.toImage(e.offsetX, e.offsetY)

      if (self.mode === 'rect' || self.mode === 'ellipse') {
        self._state.drawStart = imgPt
      } else if (self.mode === 'point') {
        self._shapeLayer!.addShape({
          id: createShapeId(),
          type: 'point',
          x: imgPt.x,
          y: imgPt.y,
          group: self.currentGroup
        })
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
      } else if (self.mode === 'polyline') {
        const pl = self._activePolyline()
        if (!pl) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'polyline',
            points: [{ x: imgPt.x, y: imgPt.y }],
            complete: false,
            group: self.currentGroup
          })
        } else {
          pl.points.push({ x: imgPt.x, y: imgPt.y })
        }
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
      } else if (self.mode === 'polygon') {
        self._shapeLayer!.clearCursorPreview()
        const poly = self._activePolygon()
        if (!poly) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'polygon',
            points: [{ x: imgPt.x, y: imgPt.y }],
            complete: false,
            group: self.currentGroup
          })
        } else {
          poly.points.push({ x: imgPt.x, y: imgPt.y })
        }
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
      } else if (self.mode === 'curve') {
        const curve = self._activeCurve()
        if (!curve) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'curve',
            points: [{ x: imgPt.x, y: imgPt.y }],
            complete: false,
            group: self.currentGroup
          })
        } else {
          curve.points.push({ x: imgPt.x, y: imgPt.y })
        }
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
      } else if (self.mode === 'joint') {
        let joint = self._activeJoint()
        if (!joint) {
          joint = {
            id: createShapeId(),
            type: 'joint',
            skeleton: 'coco-person-17',
            points: createCocoPersonPoints(),
            nextPointIndex: 0,
            complete: false,
            group: self.currentGroup
          }
          self._shapeLayer!.addShape(joint)
        }
        setJointPoint(joint, joint.nextPointIndex, imgPt, e.shiftKey ? 1 : 2)
        joint.nextPointIndex++
        if (joint.nextPointIndex >= joint.points.length) joint.complete = true
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
      } else if (self.mode === 'cuboid') {
        self._state.drawStart = imgPt
      }
    }

    const onMouseMove = (e: MouseEvent): void => {
      self._shapeLayer?.setCrosshairPoint(e.offsetX, e.offsetY)
      if (self._state.panning) {
        const dx = self._state.panStart!.x - e.offsetX
        const dy = self._state.panStart!.y - e.offsetY
        self._viewport.pan(dx, dy)
        self._state.panStart = { x: e.offsetX, y: e.offsetY }
        return
      }

      if (self.readonly) {
        self._shapeLayer?.drawHistory(e)
        return
      }

      if (self._state.selecting && self._state.selectStart) {
        self._shapeLayer!.drawSelectionBox(self._state.selectStart, {
          x: e.offsetX,
          y: e.offsetY
        })
        return
      }

      if (self.interactionMode === 'draw' && self.mode === 'polygon') {
        const polygon = self._activePolygon()
        if (polygon?.points.length) {
          self._shapeLayer!.drawCursorPreview(
            polygon.points[polygon.points.length - 1],
            self._viewport.toImage(e.offsetX, e.offsetY),
            polygon.group
          )
          return
        }
      }

      if (
        self.interactionMode === 'draw' &&
        self.mode === 'mask' &&
        (self.maskTool === 'polygon' || self.maskTool === 'inverse-polygon') &&
        self._maskPolygonPoints.length > 0
      ) {
        const imagePoint = self._viewport.toImage(e.offsetX, e.offsetY)
        self._shapeLayer!.drawLivePath([...self._maskPolygonPoints, imagePoint], self.currentGroup)
        return
      }

      if (self._state.drawing && self.mode === 'mask') {
        const imagePoint = self._viewport.toImage(e.offsetX, e.offsetY)
        const mask = self._shapeLayer!.shapes[self._state.dragIdx]
        const last = self._maskLastPoint
        if (
          mask?.type === 'mask' &&
          last &&
          Math.hypot(imagePoint.x - last.x, imagePoint.y - last.y) >=
            Math.max(1, self.maskBrushSize / 6)
        ) {
          mask.bitmap = applyMaskOperation(
            mask.bitmap,
            {
              kind: 'stroke',
              operation: self.maskTool === 'eraser' ? 'erase' : 'paint',
              points: [last, imagePoint],
              size: self.maskBrushSize
            },
            self.getImageSize()
          )
          self._maskLastPoint = imagePoint
          self._shapeLayer!.drawHistory()
          self._liveNotify()
        }
        return
      }

      if (self._state.rotating) {
        const s = self._shapeLayer!.shapes[self._shapeLayer!.current] as RectShape
        const img = self._viewport.toImage(e.offsetX, e.offsetY)
        const currentAngle = Math.atan2(img.y - s.y, img.x - s.x)
        const rawDelta = currentAngle - self._state.rotateStartAngle!
        const delta = normalizeAngle(rawDelta)
        s.rotation = normalizeAngle(
          self._state.rotateCache!.rotation + delta - self._state.offsetAngle!
        )
        self._shapeLayer!.drawHistory(e)
        self._setCursor(e)
        self._liveNotify()
        return
      }

      if (self._state.resizing) {
        const s = self._shapeLayer!.shapes[self._shapeLayer!.current] as RectShape
        const c = self._state.resizeCache!
        const img = self._viewport.toImage(e.offsetX, e.offsetY)
        // _toLocal 必须基于缓存的原始中心计算，避免每帧用被修改后的 s 做原点导致累积偏移
        const cos_n = Math.cos(-c.rotation),
          sin_n = Math.sin(-c.rotation)
        const dx_img = img.x - c.x,
          dy_img = img.y - c.y
        const local = { x: dx_img * cos_n - dy_img * sin_n, y: dx_img * sin_n + dy_img * cos_n }
        const dX = local.x - self._state.resizeStartLocal!.x
        const dY = local.y - self._state.resizeStartLocal!.y
        const r = self._state.resizeDirection

        let dcx = 0,
          dcy = 0,
          newW = c.w,
          newH = c.h
        if (r.indexOf('L') >= 0) {
          newW = c.w - dX
          dcx = dX / 2
        }
        if (r.indexOf('R') >= 0) {
          newW = c.w + dX
          dcx = dX / 2
        }
        if (r.indexOf('T') >= 0) {
          newH = c.h - dY
          dcy = dY / 2
        }
        if (r.indexOf('B') >= 0) {
          newH = c.h + dY
          dcy = dY / 2
        }

        if (newW < 5 || newH < 5) return

        const cos = Math.cos(s.rotation),
          sin = Math.sin(s.rotation)
        s.x = c.x + dcx * cos - dcy * sin
        s.y = c.y + dcx * sin + dcy * cos
        s.w = newW
        s.h = newH
        self._shapeLayer!.drawHistory(e)
        self._setCursor(e)
        self._liveNotify()
        return
      }

      if (self._state.dragging) {
        const dImgX = (self._state.dragStart!.x - e.offsetX) / self._viewport.scale
        const dImgY = (self._state.dragStart!.y - e.offsetY) / self._viewport.scale
        const s = self._shapeLayer!.shapes[self._state.dragIdx]
        const c = self._state.dragCache!
        if (s.type === 'rect' || s.type === 'ellipse') {
          s.x = c.x - dImgX
          s.y = c.y - dImgY
        } else if (s.type === 'point') {
          s.x = c.x - dImgX
          s.y = c.y - dImgY
        } else if (
          s.type === 'polyline' ||
          s.type === 'polygon' ||
          s.type === 'curve' ||
          s.type === 'cuboid' ||
          s.type === 'joint'
        ) {
          if (self._state.dragVertexIdx >= 0) {
            s.points[self._state.dragVertexIdx].x = c.points![self._state.dragVertexIdx].x - dImgX
            s.points[self._state.dragVertexIdx].y = c.points![self._state.dragVertexIdx].y - dImgY
          } else if (s.type === 'cuboid' && self._state.dragFaceVertexIndices) {
            for (const vertexIdx of self._state.dragFaceVertexIndices) {
              s.points[vertexIdx].x = c.points![vertexIdx].x - dImgX
              s.points[vertexIdx].y = c.points![vertexIdx].y - dImgY
            }
          } else {
            for (let j = 0; j < s.points.length; j++) {
              if (s.type === 'joint' && s.points[j].visibility === 0) continue
              s.points[j].x = c.points![j].x - dImgX
              s.points[j].y = c.points![j].y - dImgY
            }
          }
        } else if (s.type === 'mask') {
          const bitmap = c.bitmap || emptyMaskBitmap()
          s.bitmap = {
            ...bitmap,
            x: Math.round(bitmap.x - dImgX),
            y: Math.round(bitmap.y - dImgY)
          }
        }
        self._shapeLayer!.drawHistory(e)
        self._liveNotify()
        return
      }

      if (
        self._state.drawing &&
        (self.mode === 'rect' || self.mode === 'ellipse' || self.mode === 'cuboid')
      ) {
        const imgPt = self._viewport.toImage(e.offsetX, e.offsetY)
        if (self.mode === 'cuboid') {
          self._shapeLayer!.drawLiveCuboid(
            self._state.drawStart!.x,
            self._state.drawStart!.y,
            imgPt.x,
            imgPt.y
          )
        } else if (self.mode === 'ellipse') {
          const end = circleEnd(self._state.drawStart!, imgPt)
          self._shapeLayer!.drawLiveEllipse(
            self._state.drawStart!.x,
            self._state.drawStart!.y,
            end.x,
            end.y
          )
        } else {
          self._shapeLayer!.drawLiveRect(
            self._state.drawStart!.x,
            self._state.drawStart!.y,
            imgPt.x,
            imgPt.y
          )
        }
        return
      }

      if (self._hoverRafId === null) {
        self._hoverRafId = requestAnimationFrame(() => {
          self._hoverRafId = null
          self._shapeLayer!.drawHistory(e)
          self._setCursor(e)
        })
      }
    }

    const onMouseUp = (e: MouseEvent): void => {
      if (self._state.panning) {
        self._state.panning = false
        self._state.panStart = null
        self._notify()
        return
      }

      if (self._state.selecting) {
        const start = self._state.selectStart
        self._state.selecting = false
        self._state.selectStart = null
        self._shapeLayer!.clearSelectionBox()
        self._shapeLayer!.shapes.forEach((shape) => {
          shape.current = false
        })
        if (start && Math.hypot(e.offsetX - start.x, e.offsetY - start.y) >= 4) {
          const selectedIndices = self._shapeLayer!.shapesInSelectionBox(start, {
            x: e.offsetX,
            y: e.offsetY
          })
          selectedIndices.forEach((index) => {
            self._shapeLayer!.shapes[index].current = true
          })
          self._shapeLayer!.current =
            selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1] : -1
        } else {
          self._shapeLayer!.current = -1
        }
        self._shapeLayer!.drawHistory()
        self._notify()
        return
      }

      if (self._state.drawing && self.mode === 'mask') {
        const mask = self._shapeLayer!.shapes[self._state.dragIdx]
        if (mask?.type === 'mask' && (mask.bitmap.width === 0 || mask.bitmap.height === 0)) {
          self._shapeLayer!.shapes.splice(self._state.dragIdx, 1)
          self._shapeLayer!.current = -1
          self._activeMaskIndex = null
          self._maskAppendLocked = false
        } else if (!self._maskAppendLocked) {
          self._activeMaskIndex = null
        }
        self._state.drawing = false
        self._state.dragIdx = -1
        self._state.dragStart = null
        self._state.drawStart = null
        self._maskLastPoint = null
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
        return
      }

      if (self._state.rotating) {
        self._state.rotating = false
        self._state.rotateCache = null
        self._state.rotateStartAngle = null
        self._state.offsetAngle = null
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
        return
      }

      if (self._state.resizing) {
        self._state.resizing = false
        self._state.resizeDirection = 'OUT'
        self._state.resizeCache = null
        self._state.resizeStartLocal = null
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
        return
      }

      if (self._state.dragging) {
        self._state.dragging = false
        self._state.dragIdx = -1
        self._state.dragVertexIdx = -1
        self._state.dragFaceVertexIndices = null
        self._state.dragCache = null
        self._state.dragStart = null
        self._shapeLayer!.drawHistory()
        self._saveSnapshot()
        self._notify()
        return
      }

      if (self._state.drawing && self.mode === 'cuboid') {
        const end = self._viewport.toImage(e.offsetX, e.offsetY)
        const start = self._state.drawStart!
        if (Math.abs(start.x - end.x) > 4 && Math.abs(start.y - end.y) > 4) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'cuboid',
            points: cuboidVertices(start, end),
            complete: true,
            group: self.currentGroup
          })
          self._saveSnapshot()
          self._notify()
        }
        self._shapeLayer!.clearLiveCuboid()
        self._state.drawing = false
        self._state.drawStart = null
        self._shapeLayer!.drawHistory()
        return
      }

      if (self._state.drawing && self.mode === 'rect') {
        const imgPt = self._viewport.toImage(e.offsetX, e.offsetY)
        const start = self._state.drawStart!
        const end = imgPt
        if (Math.abs(start.x - end.x) > 2 && Math.abs(start.y - end.y) > 2) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'rect',
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
            w: Math.abs(end.x - start.x),
            h: Math.abs(end.y - start.y),
            rotation: 0,
            group: self.currentGroup
          })
          self._saveSnapshot()
          self._notify()
        }
        self._shapeLayer!.clearLiveRect()
        self._state.drawing = false
        self._state.drawStart = null
        self._shapeLayer!.drawHistory()
        return
      }

      if (self._state.drawing && self.mode === 'ellipse') {
        const start = self._state.drawStart!
        const end = circleEnd(start, self._viewport.toImage(e.offsetX, e.offsetY))
        if (Math.abs(start.x - end.x) > 2 && Math.abs(start.y - end.y) > 2) {
          self._shapeLayer!.addShape({
            id: createShapeId(),
            type: 'ellipse',
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
            w: Math.abs(end.x - start.x),
            h: Math.abs(end.y - start.y),
            rotation: 0,
            group: self.currentGroup
          })
          self._saveSnapshot()
          self._notify()
        }
        self._shapeLayer!.clearLiveEllipse()
        self._state.drawing = false
        self._state.drawStart = null
        self._shapeLayer!.drawHistory()
        return
      }

      if (self._state.drawing) {
        self._state.drawing = false
      }
    }

    const onMouseLeave = (e: MouseEvent): void => {
      self._shapeLayer?.clearCursorPreview()
      onMouseUp(e)
      self._shapeLayer?.clearCrosshairPoint()
      self._shapeLayer?.drawHistory()
    }

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      self.zoom(e.deltaY < 0 ? 0.1 : -0.1)
    }

    return { onMouseDown, onMouseMove, onMouseUp, onMouseLeave, onWheel }
  }

  /**
   * 加载新图片到底图层
   * @param src - 图片 URL
   * @returns 加载完成时 resolve
   */
  loadImage(src: string): Promise<void> {
    return this._imageLayer!.loadImage(src).then((image) => {
      if (image) this.resetView()
    })
  }

  /**
   * 加载图形和视图状态（loadAnnotationState 的别名）
   * @param shapes - 图形数组
   * @param meta - 视图元数据
   */
  loadShapes(shapes: Shape[], meta: Meta): void {
    this.loadAnnotationState(shapes, meta)
  }

  /**
   * 加载标注状态（图形 + 视图），重置历史
   * @param shapes - 图形数组
   * @param meta - 视图元数据（scale / translate / mode / group）
   */
  loadAnnotationState(
    shapes: Shape[],
    meta: Meta,
    options: { preserveToolState?: boolean } = {}
  ): void {
    if (this._shapeLayer) {
      this._shapeLayer.shapes = this._normalizeShapes(shapes).map((shape) =>
        shape.type === 'cuboid' && shape.points.length >= 2 && shape.points.length < 8
          ? { ...shape, points: cuboidVertices(shape.points[0], shape.points[1]) }
          : shape
      )
      this._shapeLayer.current = this._shapeLayer.shapes.findIndex((s) => s.current)
      this._activeMaskIndex = null
      this._maskAppendLocked = false
      this._maskPolygonPoints = []
      this._maskMergeStart = null
      this._maskLastPoint = null
      this._pathClipStart = null
      this._pathReshape = null
      this._polygonMergeStart = null
      Object.assign(this._state, {
        drawing: false,
        dragging: false,
        resizing: false,
        panning: false,
        rotating: false,
        selecting: false,
        dragIdx: -1,
        dragVertexIdx: -1,
        dragFaceVertexIndices: null,
        dragCache: null,
        dragStart: null,
        resizeDirection: 'OUT',
        resizeCache: null,
        resizeStartLocal: null,
        rotateCache: null,
        rotateStartAngle: null,
        offsetAngle: null,
        panStart: null,
        drawStart: null,
        selectStart: null
      })
      this._shapeLayer.clearCursorPreview()
      this._shapeLayer.clearLivePath()
      this._shapeLayer.clearLiveRect()
      this._shapeLayer.clearLiveEllipse()
      this._shapeLayer.clearLiveCuboid()
      // 注释掉以保持当前视口不变，避免缩放/平移后加载数据时背景图错位
      // this._shapeLayer.scale = meta.scale
      // this._shapeLayer.translateX = meta.translateX
      // this._shapeLayer.translateY = meta.translateY
      if (!options.preserveToolState) {
        this.mode = meta.mode || this.mode
        if (meta.group && this._groupMap[meta.group]) {
          this.currentGroup = meta.group
          this._shapeLayer._group = meta.group
        }
        if (meta.maskTool) this.maskTool = meta.maskTool
        if (meta.maskBrushSize) this.maskBrushSize = meta.maskBrushSize
      }
      this._shapeLayer.mode = this.mode
      if (meta.imageAdjustments) {
        this.imageAdjustments = { ...meta.imageAdjustments }
        this._imageLayer?.setAdjustments(this.imageAdjustments)
      }
      this._shapeLayer.showLabels = meta.showLabels ?? true
      this._shapeLayer.showGrid = meta.showGrid ?? true
      this._shapeLayer.showCrosshair = meta.showCrosshair ?? true
      if (meta.rotation !== undefined) {
        this._viewport.setRotation(
          meta.rotation,
          this._shapeLayer.canvas.width,
          this._shapeLayer.canvas.height
        )
      }
      this._shapeLayer.drawHistory()
      this._resetHistoryToCurrent()
    }
  }

  /** 重置缩放为 1× 并归零平redraw()（同时恢复 ImageLayer 和 ShapeLayer 的视口） */
  resetView(): void {
    this._viewport.reset()
  }

  /** 解绑所有鼠标事件监听，销毁控制器（用于组件卸载前清理） */
  destroy(): void {
    if (!this._shapeLayer || !this._boundHandlers) return
    const c = this._shapeLayer.canvas
    const h = this._boundHandlers
    c.removeEventListener('mousedown', h.onMouseDown)
    c.removeEventListener('mousemove', h.onMouseMove)
    c.removeEventListener('mouseup', h.onMouseUp)
    c.removeEventListener('mouseout', h.onMouseLeave)
    c.removeEventListener('wheel', h.onWheel)
    if (this._notifyRafId !== null) cancelAnimationFrame(this._notifyRafId)
    if (this._viewportRafId !== null) cancelAnimationFrame(this._viewportRafId)
    if (this._hoverRafId !== null) cancelAnimationFrame(this._hoverRafId)
    this._cancelAnim()
  }
}
