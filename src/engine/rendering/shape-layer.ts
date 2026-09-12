import { Viewport } from '../interaction/viewport'
import { buildGroupMap, DEFAULT_GROUPS, ensureShapeIds } from '../shared/utils'
import { sampleCurve } from '../geometry/curve'
import { pointInNonZeroPolygon } from '../geometry/polygon-hit'
import { COCO_PERSON_SKELETON, jointPointLabel, placedJointPoints } from '../joint/coco-person'
import { decodeMaskBitmap, maskBitmapContains } from '../mask/bitmap'
import type {
  Point,
  Group,
  Shape,
  RectShape,
  PointShape,
  PolylineShape,
  PolygonShape,
  CurveShape,
  EllipseShape,
  MaskShape,
  CuboidShape,
  JointShape,
  VertexHit,
  Handle,
  InteractionMode
} from '../model/types'

type LiveRectShape = Omit<RectShape, 'id'>
type LiveEllipseShape = Omit<EllipseShape, 'id'>
type LiveCuboidShape = Omit<CuboidShape, 'id'>

/**
 * 十六进制颜色转 rgba 字符串
 * @param hex - 6 位十六进制颜色（如 #e53935）
 * @param alpha - 透明度 0-1
 * @returns rgba 字符串
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** 将旧版控制点展开为立方体的 8 个可见顶点。 */
function cuboidCorners(points: Point[]): Point[] {
  if (points.length >= 8) return points.slice(0, 8)
  if (points.length < 2) return points
  const [start, end] = points
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const right = Math.max(start.x, end.x)
  const bottom = Math.max(start.y, end.y)
  const depth = Math.min(right - left, bottom - top) * 0.22
  const front = [
    { x: left + depth, y: top + depth },
    { x: right, y: top + depth },
    { x: right, y: bottom },
    { x: left + depth, y: bottom }
  ]
  const back = [
    { x: left, y: top },
    { x: right - depth, y: top },
    { x: right - depth, y: bottom - depth },
    { x: left, y: bottom - depth }
  ]
  return [...front, ...back]
}

function maskPoints(shape: MaskShape): Point[] {
  const { x, y, width, height } = shape.bitmap
  return width > 0 && height > 0
    ? [
        { x, y },
        { x: x + width, y: y + height }
      ]
    : []
}

export class ShapeLayer {
  /** Canvas 元素引用 */
  canvas: HTMLCanvasElement
  /** Canvas 2D 渲染上下文 */
  ctx: CanvasRenderingContext2D
  /** 所有标注图形列表 */
  shapes: Shape[]
  /** 当前选中图形在 shapes 中的索引，-1 表示无选中 */
  current: number
  _viewport: Viewport
  _groups: Record<string, Group>
  _defaultGroup: Group
  _group: string
  _mode: string
  /** 交互模式：'draw' 绘制 / 'select' 选择 / 'edit' 编辑 */
  interactionMode: InteractionMode
  showLabels: boolean
  showGrid: boolean
  showCrosshair: boolean
  _liveRect: LiveRectShape | null
  _liveEllipse: LiveEllipseShape | null
  _liveCuboid: LiveCuboidShape | null
  _livePath: { points: Point[]; group: string } | null
  _selectionBox: { start: Point; end: Point } | null
  _cursorPreview: { start: Point; end: Point; group: string } | null
  _crosshairPoint: Point | null
  _hoveredShapeIndex: number
  _maskCanvasCache: Map<
    string,
    { counts: number[]; width: number; height: number; color: string; canvas: HTMLCanvasElement }
  >

  /**
   * 初始化图形图层
   * @param canvas - 目标 Canvas 元素
   * @param viewport - 视口状态
   */
  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2d context')
    this.ctx = ctx
    this.shapes = []
    this.current = -1
    this._viewport = viewport
    this._groups = buildGroupMap(DEFAULT_GROUPS)
    this._defaultGroup = DEFAULT_GROUPS[0]
    this._group = DEFAULT_GROUPS[0].name
    this._mode = 'rect'
    this.interactionMode = 'draw'
    this.showLabels = true
    this.showGrid = true
    this.showCrosshair = true
    this._liveRect = null
    this._liveEllipse = null
    this._liveCuboid = null
    this._livePath = null
    this._selectionBox = null
    this._cursorPreview = null
    this._crosshairPoint = null
    this._hoveredShapeIndex = -1
    this._maskCanvasCache = new Map()
  }

  /** 设置当前绘制图形类型（'rect' | 'point' | 'polyline' | 'polygon'） */
  set mode(v: string) {
    this._mode = v
  }
  /** 获取当前绘制图形类型 */
  get mode(): string {
    return this._mode
  }

  /* ---- Coordinate helpers ---- */

  /**
   * 将画布像素坐标转换为图像坐标（考虑缩放与平移）
   * @param px - 画布 X 坐标
   * @param py - 画布 Y 坐标
   * @returns 图像坐标系下的 Point
   */
  toImage(px: number, py: number): Point {
    return this._viewport.toImage(px, py)
  }

  /**
   * 将图像坐标转换为画布像素坐标（考虑缩放与平移）
   * @param ix - 图像 X 坐标
   * @param iy - 图像 Y 坐标
   * @returns 画布像素坐标系下的 Point
   */
  toCanvas(ix: number, iy: number): Point {
    return this._viewport.toCanvas(ix, iy)
  }

  /* ---- Viewport transforms ---- */

  /**
   * 设置缩放倍数并重绘
   * @param multi - 新的缩放倍数
   */
  zoom(multi: number): void {
    this._viewport.zoom(multi)
  }

  /**
   * 平移视图并重绘
   * @param dx - 画布像素 X 方向偏移量
   * @param dy - 画布像素 Y 方向偏移量
   */
  pan(dx: number, dy: number): void {
    this._viewport.pan(dx, dy)
  }

  /* ---- Shape management ---- */

  /**
   * 向图层尾部添加一个图形
   * @param shape - 任意类型图形对象
   */
  addShape(shape: Shape): void {
    const candidate = this.shapes.some((item) => item.id === shape.id)
      ? ({ ...shape, id: '' } as Shape)
      : shape
    this.shapes.push(ensureShapeIds([candidate])[0])
  }
  /** 移除最后一个图形 */
  popShape(): void {
    this.shapes.pop()
  }
  /** 触发视口重绘（由 Viewport.onChange 回调调用） */
  redraw(): void {
    this.drawHistory()
  }

  /** 清空所有图形，重置选中状态，并重绘 */
  clearAll(): void {
    this.shapes = []
    this.current = -1
    this.drawHistory()
  }

  /* ---- Local space helper for rotated rects ---- */

  /** 将图像坐标转换为矩形局部坐标（反向旋转） */
  _toLocal(ix: number, iy: number, shape: RectShape | EllipseShape): Point {
    const dx = ix - shape.x
    const dy = iy - shape.y
    const cos = Math.cos(-shape.rotation)
    const sin = Math.sin(-shape.rotation)
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos }
  }

  /** 将矩形局部坐标转换回图像坐标（正向旋转） */
  _fromLocal(lx: number, ly: number, shape: RectShape | EllipseShape): Point {
    const cos = Math.cos(shape.rotation)
    const sin = Math.sin(shape.rotation)
    return {
      x: shape.x + lx * cos - ly * sin,
      y: shape.y + lx * sin + ly * cos
    }
  }

  /* ---- Hit testing ---- */

  /**
   * 碰撞检测：根据画布像素坐标返回命中的图形索引，未命中返回 -1
   * 矩形用 AABB（局部旋转空间），点用距离阈值，折线/多边形用点线距离或射线法
   * @param pixelX - 画布 X 坐标
   * @param pixelY - 画布 Y 坐标
   * @returns 命中图形的下标，-1 表示未命中
   */
  hitTest(pixelX: number, pixelY: number): number {
    const img = this.toImage(pixelX, pixelY)
    const len = this.shapes.length
    for (let i = len - 1; i >= 0; i--) {
      const s = this.shapes[i]
      if (s.hidden) continue
      if (s.type === 'rect' || s.type === 'ellipse') {
        const local = this._toLocal(img.x, img.y, s)
        const hw = s.w / 2,
          hh = s.h / 2
        if (
          s.type === 'rect'
            ? local.x >= -hw && local.x <= hw && local.y >= -hh && local.y <= hh
            : hw > 0 &&
              hh > 0 &&
              (local.x * local.x) / (hw * hw) + (local.y * local.y) / (hh * hh) <= 1
        )
          return i
      } else if (s.type === 'point') {
        const p = this.toCanvas(s.x, s.y)
        if (Math.hypot(pixelX - p.x, pixelY - p.y) <= 6) return i
      } else if (s.type === 'polyline') {
        if (this._hitPolyline(pixelX, pixelY, s.points)) return i
      } else if (s.type === 'polygon') {
        if (s.complete && this._pointInPolygon(img.x, img.y, s.points)) return i
        if (!s.complete && this._hitPolyline(pixelX, pixelY, s.points)) return i
      } else if (s.type === 'curve') {
        if (this._hitPolyline(pixelX, pixelY, sampleCurve(s.points))) return i
      } else if (s.type === 'mask') {
        if (maskBitmapContains(s.bitmap, img)) return i
      } else if (s.type === 'cuboid') {
        const corners = cuboidCorners(s.points)
        if (corners.length >= 4) {
          const front = corners.slice(0, 4)
          if (this._pointInPolygon(img.x, img.y, front)) return i
          if (corners.length === 8) {
            const back = corners.slice(4, 8)
            if (this._pointInPolygon(img.x, img.y, back)) return i
            for (let j = 0; j < 4; j++) {
              if (this._hitSegment(pixelX, pixelY, front[j], back[j])) return i
            }
          }
        } else if (this._hitPolyline(pixelX, pixelY, corners)) return i
      } else if (s.type === 'joint') {
        const visiblePoints = placedJointPoints(s)
        if (
          visiblePoints.some((point) => {
            const canvasPoint = this.toCanvas(point.x, point.y)
            return Math.hypot(pixelX - canvasPoint.x, pixelY - canvasPoint.y) <= 6
          })
        )
          return i
        if (
          COCO_PERSON_SKELETON.some(([startIndex, endIndex]) => {
            const start = s.points[startIndex]
            const end = s.points[endIndex]
            return start?.visibility > 0 && end?.visibility > 0
              ? this._hitSegment(pixelX, pixelY, start, end)
              : false
          })
        )
          return i
      }
    }
    return -1
  }

  /**
   * 顶点碰撞检测：仅在折线/多边形上检测，返回命中的形状索引和顶点索引
   * @param pixelX - 画布 X 坐标
   * @param pixelY - 画布 Y 坐标
   * @returns VertexHit 对象或 null
   */
  vertexHitTest(pixelX: number, pixelY: number): VertexHit | null {
    const len = this.shapes.length
    for (let i = len - 1; i >= 0; i--) {
      const s = this.shapes[i]
      if (s.hidden) continue
      if (
        s.type !== 'polyline' &&
        s.type !== 'polygon' &&
        s.type !== 'curve' &&
        s.type !== 'cuboid' &&
        s.type !== 'joint'
      )
        continue
      const pts = s.points
      for (let j = 0; j < pts.length; j++) {
        if (s.type === 'joint' && s.points[j].visibility === 0) continue
        const p = this.toCanvas(pts[j].x, pts[j].y)
        if (Math.hypot(pixelX - p.x, pixelY - p.y) <= 6) {
          return { shapeIdx: i, vertexIdx: j }
        }
      }
    }
    return null
  }

  /**
   * 命中当前选中立方体的一个面。顶点命中应优先于本检测，保证单点编辑不受影响。
   */
  cuboidFaceHitTest(
    pixelX: number,
    pixelY: number
  ): { shapeIdx: number; vertexIndices: number[] } | null {
    const shapeIdx = this.current
    const shape = this.shapes[shapeIdx]
    if (!shape || shape.hidden || !shape.current || shape.type !== 'cuboid') return null
    const corners = cuboidCorners(shape.points)
    if (corners.length !== 8) return null
    const imagePoint = this._viewport.toImage(pixelX, pixelY)
    // 侧面优先，避免投影视图中的重叠区域总被前后面抢占。
    const faces = [
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [0, 1, 2, 3],
      [4, 5, 6, 7]
    ]
    for (const vertexIndices of faces) {
      if (
        this._pointInPolygon(
          imagePoint.x,
          imagePoint.y,
          vertexIndices.map((i) => corners[i])
        )
      ) {
        return { shapeIdx, vertexIndices }
      }
    }
    return null
  }

  /**
   * 查找鼠标命中线段时的插入位置（顶点索引折中处）
   * @param pixelX - 画布 X 坐标
   * @param pixelY - 画布 Y 坐标
   * @param shapeIdx - 目标图形索引
   * @returns 插入位置的顶点下标，无效返回 null
   */
  findEdgeInsertIndex(pixelX: number, pixelY: number, shapeIdx: number): number | null {
    return this.findEdgeProjection(pixelX, pixelY, shapeIdx)?.insertIdx ?? null
  }

  /** 返回折线/多边形边上的精确投影点，供增点与路径裁剪工具使用。 */
  findEdgeProjection(
    pixelX: number,
    pixelY: number,
    shapeIdx: number
  ): { insertIdx: number; edgeIdx: number; point: Point; ratio: number } | null {
    const s = this.shapes[shapeIdx]
    if (!s || s.hidden || (s.type !== 'polygon' && s.type !== 'polyline')) return null
    const pts = s.points
    if (pts.length < 2) return null
    const end = s.type === 'polygon' ? pts.length : pts.length - 1
    for (let edgeIdx = 0; edgeIdx < end; edgeIdx++) {
      const start = pts[edgeIdx]
      const finish = pts[(edgeIdx + 1) % pts.length]
      if (!this._hitSegment(pixelX, pixelY, start, finish)) continue
      const canvasStart = this.toCanvas(start.x, start.y)
      const canvasEnd = this.toCanvas(finish.x, finish.y)
      const dx = canvasEnd.x - canvasStart.x
      const dy = canvasEnd.y - canvasStart.y
      const lengthSquared = dx * dx + dy * dy
      const ratio =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((pixelX - canvasStart.x) * dx + (pixelY - canvasStart.y) * dy) / lengthSquared
              )
            )
      return {
        insertIdx: edgeIdx + 1,
        edgeIdx,
        point: {
          x: start.x + (finish.x - start.x) * ratio,
          y: start.y + (finish.y - start.y) * ratio
        },
        ratio
      }
    }
    return null
  }

  /** 检测画布坐标是否命中折线/多边形的顶点或线段（距离阈值 6px） */
  _hitPolyline(pixelX: number, pixelY: number, points: Point[]): boolean {
    for (let j = 0; j < points.length; j++) {
      const p = this.toCanvas(points[j].x, points[j].y)
      if (Math.hypot(pixelX - p.x, pixelY - p.y) <= 6) return true
    }
    for (let j = 0; j < points.length - 1; j++) {
      if (this._hitSegment(pixelX, pixelY, points[j], points[j + 1])) return true
    }
    return false
  }

  /** 检测画布坐标是否命中两点之间的线段（距离阈值 6px） */
  _hitSegment(px: number, py: number, a: Point, b: Point): boolean {
    const pa = this.toCanvas(a.x, a.y)
    const pb = this.toCanvas(b.x, b.y)
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - pa.x, py - pa.y) <= 6
    let t = ((px - pa.x) * dx + (py - pa.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const nx = pa.x + t * dx,
      ny = pa.y + t * dy
    return Math.hypot(px - nx, py - ny) <= 6
  }

  /** 按 Canvas nonzero 填充规则判断图像坐标点是否在多边形内部。 */
  _pointInPolygon(px: number, py: number, points: Point[]): boolean {
    return pointInNonZeroPolygon({ x: px, y: py }, points)
  }

  /** 返回与画布拉框相交的所有可见标注索引。 */
  shapesInSelectionBox(start: Point, end: Point): number[] {
    const first = this.toImage(start.x, start.y)
    const second = this.toImage(end.x, end.y)
    const selection = {
      left: Math.min(first.x, second.x),
      top: Math.min(first.y, second.y),
      right: Math.max(first.x, second.x),
      bottom: Math.max(first.y, second.y)
    }
    const intersects = (bounds: { left: number; top: number; right: number; bottom: number }) =>
      !(
        bounds.right < selection.left ||
        bounds.left > selection.right ||
        bounds.bottom < selection.top ||
        bounds.top > selection.bottom
      )

    const hits: number[] = []
    this.shapes.forEach((shape, index) => {
      if (shape.hidden) return
      const bounds = this._shapeBounds(shape)
      if (bounds && intersects(bounds)) hits.push(index)
    })
    return hits
  }

  _shapeBounds(shape: Shape): { left: number; top: number; right: number; bottom: number } | null {
    let points: Point[] = []
    if (shape.type === 'rect' || shape.type === 'ellipse') {
      const halfWidth = shape.w / 2
      const halfHeight = shape.h / 2
      points = [
        this._fromLocal(-halfWidth, -halfHeight, shape),
        this._fromLocal(halfWidth, -halfHeight, shape),
        this._fromLocal(halfWidth, halfHeight, shape),
        this._fromLocal(-halfWidth, halfHeight, shape)
      ]
    } else if (shape.type === 'point') {
      const radius = 6 / this._viewport.scale
      return {
        left: shape.x - radius,
        top: shape.y - radius,
        right: shape.x + radius,
        bottom: shape.y + radius
      }
    } else if (shape.type === 'mask') {
      const { x, y, width, height } = shape.bitmap
      if (width <= 0 || height <= 0) return null
      return { left: x, top: y, right: x + width, bottom: y + height }
    } else if (shape.type === 'curve') {
      points = sampleCurve(shape.points)
    } else if (shape.type === 'cuboid') {
      points = cuboidCorners(shape.points)
    } else if (shape.type === 'joint') {
      points = placedJointPoints(shape)
    } else {
      points = shape.points
    }
    if (points.length === 0) return null
    return points.reduce(
      (bounds, point) => ({
        left: Math.min(bounds.left, point.x),
        top: Math.min(bounds.top, point.y),
        right: Math.max(bounds.right, point.x),
        bottom: Math.max(bounds.bottom, point.y)
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    )
  }

  /**
   * 矩形手柄碰撞检测：返回命中的手柄类型，同时自动选中该图形
   * 手柄包括 4 角（TL/TR/BL/BR）、4 边中点（T/B/L/R）和旋转手柄（ROTATE）
   * @param pixelX - 画布 X 坐标
   * @param pixelY - 画布 Y 坐标
   * @param readOnly - 若为 true 不修改选中状态
   * @returns 手柄标识，未命中返回 'OUT'
   */
  handleHit(pixelX: number, pixelY: number, readOnly = false): Handle {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i]
      if (s.hidden) continue
      if (s.type !== 'rect' && s.type !== 'ellipse') continue

      const img = this.toImage(pixelX, pixelY)
      const local = this._toLocal(img.x, img.y, s)
      const hw = s.w / 2,
        hh = s.h / 2

      const cr = 7 / this._viewport.scale
      const er = 6 / this._viewport.scale
      const rr = 6 / this._viewport.scale

      let handle: Handle = 'OUT'

      if (Math.hypot(local.x + hw, local.y + hh) <= cr) handle = 'TL'
      else if (Math.hypot(local.x - hw, local.y + hh) <= cr) handle = 'TR'
      else if (Math.hypot(local.x + hw, local.y - hh) <= cr) handle = 'BL'
      else if (Math.hypot(local.x - hw, local.y - hh) <= cr) handle = 'BR'
      else if (Math.hypot(local.x, local.y + hh) <= er) handle = 'T'
      else if (Math.hypot(local.x, local.y - hh) <= er) handle = 'B'
      else if (Math.hypot(local.x + hw, local.y) <= er) handle = 'L'
      else if (Math.hypot(local.x - hw, local.y) <= er) handle = 'R'
      else {
        const rotHy = -hh - 22 / this._viewport.scale
        if (Math.hypot(local.x, local.y - rotHy) <= rr) handle = 'ROTATE'
      }

      if (handle !== 'OUT') {
        if (!readOnly) {
          this.shapes.forEach((shape) => {
            shape.current = false
          })
          s.current = true
          this.current = i
        }
        return handle
      }
    }
    return 'OUT'
  }

  /* ---- Viewport culling ---- */

  /** 获取当前视口边界（图像坐标，含 padding） */
  /**
   * 获取当前视口边界（图像坐标，含 padding）
   * @returns 视口四边（图像坐标），外扩 30/scale 避免边缘闪烁
   */
  _getViewportBounds(): { left: number; top: number; right: number; bottom: number } {
    const padding = 30 / this._viewport.scale
    const corners = [
      this.toImage(0, 0),
      this.toImage(this.canvas.width, 0),
      this.toImage(this.canvas.width, this.canvas.height),
      this.toImage(0, this.canvas.height)
    ]
    const xs = corners.map((point) => point.x)
    const ys = corners.map((point) => point.y)
    return {
      left: Math.min(...xs) - padding,
      top: Math.min(...ys) - padding,
      right: Math.max(...xs) + padding,
      bottom: Math.max(...ys) + padding
    }
  }

  /**
   * 判断图形是否与视口相交
   * @param s - 图形对象
   * @param bounds - 视口边界（图像坐标）
   * @returns 是否可见（选中图形始终可见）
   */
  _isShapeVisible(
    s: Shape,
    bounds: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    if (s.hidden) return false
    if (s.current) return true
    if (s.type === 'rect' || s.type === 'ellipse') {
      const hw = s.w / 2,
        hh = s.h / 2
      const cos = Math.cos(s.rotation || 0)
      const sin = Math.sin(s.rotation || 0)
      const cs = [
        { x: s.x - hw * cos - -hh * sin, y: s.y - hw * sin + -hh * cos },
        { x: s.x + hw * cos - -hh * sin, y: s.y + hw * sin + -hh * cos },
        { x: s.x + hw * cos - hh * sin, y: s.y + hw * sin + hh * cos },
        { x: s.x - hw * cos - hh * sin, y: s.y - hw * sin + hh * cos }
      ]
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity
      for (const c of cs) {
        if (c.x < minX) minX = c.x
        if (c.x > maxX) maxX = c.x
        if (c.y < minY) minY = c.y
        if (c.y > maxY) maxY = c.y
      }
      return !(
        maxX < bounds.left ||
        minX > bounds.right ||
        maxY < bounds.top ||
        minY > bounds.bottom
      )
    }
    if (s.type === 'point') {
      const r = 6 / this._viewport.scale
      return !(
        s.x + r < bounds.left ||
        s.x - r > bounds.right ||
        s.y + r < bounds.top ||
        s.y - r > bounds.bottom
      )
    }
    if (
      s.type === 'polyline' ||
      s.type === 'polygon' ||
      s.type === 'curve' ||
      s.type === 'mask' ||
      s.type === 'cuboid' ||
      s.type === 'joint'
    ) {
      const points =
        s.type === 'cuboid'
          ? cuboidCorners(s.points)
          : s.type === 'mask'
            ? maskPoints(s)
            : s.type === 'curve'
              ? sampleCurve(s.points)
              : s.type === 'joint'
                ? placedJointPoints(s)
                : s.points
      if (points.length === 0) return false
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity
      for (const p of points) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
      return !(
        maxX < bounds.left ||
        minX > bounds.right ||
        maxY < bounds.top ||
        minY > bounds.bottom
      )
    }
    return true
  }

  /* ---- Drawing ---- */

  /**
   * 全量重绘：清空画布后按 z-order 逐图形绘制，叠加虚线预览框和标签
   * @param e - 可选鼠标事件（传人时对鼠标位置做 hover 高亮）
   */
  drawHistory(e?: MouseEvent): void {
    const hitIdx = e ? this.hitTest(e.offsetX, e.offsetY) : -1
    const bounds = this._getViewportBounds()
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this._paintGrid()
    for (let i = 0; i < this.shapes.length; i++) {
      if (this._isShapeVisible(this.shapes[i], bounds)) {
        this._paintShape(i, this.shapes[i], i === hitIdx || i === this._hoveredShapeIndex)
      }
    }
    this._paintLiveRect()
    if (this._liveEllipse) this._paintEllipse(this._liveEllipse, true)
    if (this._liveCuboid) this._paintCuboid(this._liveCuboid, true)
    this._paintLivePath()
    this._paintCursorPreview()
    this._paintSelectionBox()
    if (this.showLabels) this._drawShapeLabels(bounds)
    this._paintCrosshair()
  }

  /**
   * 绘制可见图形的标签（仅 select 模式），超出视口的已裁剪
   * @param bounds - 视口边界（图像坐标）
   */
  _drawShapeLabels(bounds: { left: number; top: number; right: number; bottom: number }): void {
    if (this.interactionMode !== 'select') return
    const ctx = this.ctx
    this.shapes.forEach((s, i) => {
      if (!this._isShapeVisible(s, bounds)) return
      if (
        (s.type === 'polygon' ||
          s.type === 'polyline' ||
          s.type === 'curve' ||
          s.type === 'cuboid' ||
          s.type === 'joint') &&
        !s.complete
      )
        return
      const c = this._groups[s.group] || this._defaultGroup
      const bg = s.current ? c.stroke : hexToRgba(c.stroke, 0.5)
      const label = this._getShapeLabel(s, i)
      const anchor = this._getShapeAnchor(s)
      const p = this.toCanvas(anchor.x, anchor.y)

      ctx.font = '10px monospace'
      const tw = ctx.measureText(label).width + 8
      const th = 16
      const rx = p.x + 4,
        ry = p.y - th - 4

      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.moveTo(rx + 3, ry)
      ctx.lineTo(rx + tw - 3, ry)
      ctx.quadraticCurveTo(rx + tw, ry, rx + tw, ry + 3)
      ctx.lineTo(rx + tw, ry + th - 3)
      ctx.quadraticCurveTo(rx + tw, ry + th, rx + tw - 3, ry + th)
      ctx.lineTo(rx + 3, ry + th)
      ctx.quadraticCurveTo(rx, ry + th, rx, ry + th - 3)
      ctx.lineTo(rx, ry + 3)
      ctx.quadraticCurveTo(rx, ry, rx + 3, ry)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(label, rx + 4, ry + th - 4)
    })
  }

  /**
   * 根据图形类型返回标签文字
   * @param s - 图形对象
   * @param i - 在 shapes 中的索引
   * @returns 标签文字（如"矩形 1"）
   */
  _getShapeLabel(s: Shape, i: number): string {
    switch (s.type) {
      case 'rect':
        return `矩形 ${i + 1}`
      case 'point':
        return `点 ${i + 1}`
      case 'polygon':
        return `多边形 ${i + 1}`
      case 'polyline':
        return `折线 ${i + 1}`
      case 'curve':
        return `曲线 ${i + 1}`
      case 'ellipse':
        return `椭圆 ${i + 1}`
      case 'mask':
        return `Mask ${i + 1}`
      case 'cuboid':
        return `立方体 ${i + 1}`
      case 'joint':
        return `关节 ${i + 1}`
    }
  }

  /**
   * 获取标签锚点位置
   * @param s - 图形对象
   * @returns 图像坐标下的锚点（矩形左上角、点自身、折线/多边形第一个顶点）
   */
  _getShapeAnchor(s: Shape): Point {
    switch (s.type) {
      case 'rect':
      case 'ellipse': {
        const cos = Math.cos(s.rotation || 0)
        const sin = Math.sin(s.rotation || 0)
        return {
          x: s.x - (s.w / 2) * cos + (s.h / 2) * sin,
          y: s.y - (s.w / 2) * sin - (s.h / 2) * cos
        }
      }
      case 'point':
        return { x: s.x, y: s.y }
      case 'mask': {
        const points = maskPoints(s)
        return points[0] || { x: 0, y: 0 }
      }
      case 'polygon':
      case 'polyline':
      case 'curve':
      case 'cuboid':
        return s.points[0]
      case 'joint':
        return placedJointPoints(s)[0] || { x: 0, y: 0 }
    }
  }

  /**
   * 分发到对应类型的绘制方法
   * @param i - 图形索引
   * @param s - 图形对象
   * @param highlight - 是否高亮（hover 悬停）
   */
  _paintShape(i: number, s: Shape, highlight: boolean): void {
    if (s.type === 'rect') this._paintRect(s, highlight)
    else if (s.type === 'point') this._paintPoint(s, i, highlight)
    else if (s.type === 'polyline') this._paintPolyline(s, i, highlight)
    else if (s.type === 'polygon') this._paintPolygon(s, i, highlight)
    else if (s.type === 'curve') this._paintCurve(s, highlight)
    else if (s.type === 'ellipse') this._paintEllipse(s, highlight)
    else if (s.type === 'mask') this._paintMask(s, highlight)
    else if (s.type === 'cuboid') this._paintCuboid(s, highlight)
    else if (s.type === 'joint') this._paintJoint(s, highlight)
  }

  /**
   * 绘制矩形（使用 save/translate/rotate 矩阵变换），选中时加手柄
   * @param s - 矩形图形
   * @param highlight - 是否高亮
   */
  _paintRect(s: RectShape, highlight: boolean): void {
    const center = this.toCanvas(s.x, s.y)
    const cx = center.x
    const cy = center.y
    const cw = s.w * this._viewport.scale
    const ch = s.h * this._viewport.scale
    const c = this._groups[s.group] || this._defaultGroup

    this.ctx.save()
    this.ctx.translate(cx, cy)
    this.ctx.rotate((s.rotation || 0) + this._viewport.rotationRadians)

    if (highlight) {
      this.ctx.fillStyle = c.fillHover
      this.ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
    }
    if (s.current) {
      this.ctx.fillStyle = c.fill
      this.ctx.fillRect(-cw / 2, -ch / 2, cw, ch)
    }
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = 2
    this.ctx.strokeRect(-cw / 2, -ch / 2, cw, ch)

    if (s.current) {
      this._paintHandles(cw, ch, c)
    }

    this.ctx.restore()
  }

  /** 绘制可旋转椭圆，并复用矩形的八向缩放与旋转手柄。 */
  _paintEllipse(s: EllipseShape | LiveEllipseShape, highlight: boolean): void {
    const center = this.toCanvas(s.x, s.y)
    const cx = center.x
    const cy = center.y
    const cw = s.w * this._viewport.scale
    const ch = s.h * this._viewport.scale
    const c = this._groups[s.group] || this._defaultGroup
    this.ctx.save()
    this.ctx.translate(cx, cy)
    this.ctx.rotate((s.rotation || 0) + this._viewport.rotationRadians)
    this.ctx.beginPath()
    this.ctx.ellipse(0, 0, cw / 2, ch / 2, 0, 0, Math.PI * 2)
    if (highlight || s.current) {
      this.ctx.fillStyle = highlight ? c.fillHover : c.fill
      this.ctx.fill()
    }
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = 2
    this.ctx.stroke()
    if (s.current) this._paintHandles(cw, ch, c)
    this.ctx.restore()
  }

  /**
   * 绘制矩形选中手柄：4 边中点圆点 + 4 角圆点 + 顶部旋转柄
   * @param cw - 画布像素宽度（已缩放）
   * @param ch - 画布像素高度（已缩放）
   * @param c - 分组颜色配置
   */
  _paintHandles(cw: number, ch: number, c: Group): void {
    const hw = cw / 2,
      hh = ch / 2

    const edges = [
      { x: 0, y: -hh },
      { x: 0, y: hh },
      { x: -hw, y: 0 },
      { x: hw, y: 0 }
    ]
    for (const e of edges) {
      this.ctx.beginPath()
      this.ctx.arc(e.x, e.y, 4, 0, Math.PI * 2)
      this.ctx.fillStyle = '#fff'
      this.ctx.fill()
      this.ctx.strokeStyle = c.stroke
      this.ctx.lineWidth = 1.5
      this.ctx.stroke()
    }

    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: -hw, y: hh },
      { x: hw, y: hh }
    ]
    for (const corner of corners) {
      this.ctx.beginPath()
      this.ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2)
      this.ctx.fillStyle = '#fff'
      this.ctx.fill()
      this.ctx.strokeStyle = c.stroke
      this.ctx.lineWidth = 1.5
      this.ctx.stroke()
    }

    const ry = -hh - 20
    this.ctx.beginPath()
    this.ctx.moveTo(0, -hh)
    this.ctx.lineTo(0, ry)
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = 1
    this.ctx.stroke()

    this.ctx.beginPath()
    this.ctx.arc(0, ry, 5, 0, Math.PI * 2)
    this.ctx.fillStyle = '#fff'
    this.ctx.fill()
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = 1.5
    this.ctx.stroke()
  }

  /**
   * 绘制点图形（圆形标记 + 编号 label）
   * @param s - 点图形
   * @param i - 图形索引
   * @param highlight - 是否高亮
   */
  _paintPoint(s: PointShape, i: number, highlight: boolean): void {
    const p = this.toCanvas(s.x, s.y)
    const c = this._groups[s.group] || this._defaultGroup
    this.ctx.beginPath()
    this.ctx.arc(p.x, p.y, highlight || s.current ? 7 : 5, 0, Math.PI * 2)
    if (s.current) {
      this.ctx.fillStyle = c.fill
    } else {
      this.ctx.fillStyle = highlight ? c.fillHover : c.stroke
    }
    this.ctx.fill()
    this.ctx.strokeStyle = '#fff'
    this.ctx.lineWidth = 1.5
    this.ctx.stroke()

    this.ctx.fillStyle = '#fff'
    this.ctx.font = 'bold 12px sans-serif'
    this.ctx.fillText(String(i + 1), p.x + 8, p.y - 8)
  }

  /**
   * 绘制折线：顶点圆点 + 编号 + 连接线段，未完成时虚线
   * @param s - 折线图形
   * @param _i - 图形索引（未使用）
   * @param highlight - 是否高亮
   */
  _paintPolyline(s: PolylineShape, _i: number, highlight: boolean): void {
    const pts = s.points
    const c = this._groups[s.group] || this._defaultGroup
    for (let j = 0; j < pts.length; j++) {
      const p = this.toCanvas(pts[j].x, pts[j].y)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, highlight || s.current ? 7 : 5, 0, Math.PI * 2)
      if (s.current) {
        this.ctx.fillStyle = c.fill
      } else {
        this.ctx.fillStyle = highlight ? c.fillHover : c.stroke
      }
      this.ctx.fill()
      this.ctx.strokeStyle = '#fff'
      this.ctx.lineWidth = 1.5
      this.ctx.stroke()
      this.ctx.fillStyle = '#fff'
      this.ctx.font = 'bold 11px sans-serif'
      this.ctx.fillText(String(j + 1), p.x + 7, p.y - 7)
    }
    if (pts.length > 1) {
      this.ctx.beginPath()
      const p0 = this.toCanvas(pts[0].x, pts[0].y)
      this.ctx.moveTo(p0.x, p0.y)
      for (let j = 1; j < pts.length; j++) {
        const p = this.toCanvas(pts[j].x, pts[j].y)
        this.ctx.lineTo(p.x, p.y)
      }
      this.ctx.strokeStyle = c.stroke
      this.ctx.lineWidth = highlight ? 3 : 2
      if (s.complete === false) this.ctx.setLineDash([5, 5])
      this.ctx.stroke()
      this.ctx.setLineDash([])
    }
  }

  /** 绘制经过全部控制点的平滑曲线。 */
  _paintCurve(s: CurveShape, highlight: boolean): void {
    const sampled = sampleCurve(s.points)
    if (sampled.length === 0) return
    const c = this._groups[s.group] || this._defaultGroup
    const first = this.toCanvas(sampled[0].x, sampled[0].y)
    this.ctx.beginPath()
    this.ctx.moveTo(first.x, first.y)
    sampled.slice(1).forEach((source) => {
      const point = this.toCanvas(source.x, source.y)
      this.ctx.lineTo(point.x, point.y)
    })
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = highlight ? 3 : 2
    if (!s.complete) this.ctx.setLineDash([5, 5])
    this.ctx.stroke()
    this.ctx.setLineDash([])
    if (s.current || !s.complete) {
      s.points.forEach((source, index) => {
        const point = this.toCanvas(source.x, source.y)
        this.ctx.beginPath()
        this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
        this.ctx.fillStyle = '#fff'
        this.ctx.fill()
        this.ctx.strokeStyle = c.stroke
        this.ctx.stroke()
        this.ctx.fillStyle = c.stroke
        this.ctx.font = '10px sans-serif'
        this.ctx.fillText(String(index + 1), point.x + 7, point.y - 7)
      })
    }
  }

  /**
   * 绘制多边形：填充 + 描边 + 顶点圆点 + 编号，未完成时虚线
   * @param s - 多边形图形
   * @param _i - 图形索引（未使用）
   * @param highlight - 是否高亮
   */
  _paintPolygon(s: PolygonShape, _i: number, highlight: boolean): void {
    const pts = s.points
    if (pts.length === 0) return
    const c = this._groups[s.group] || this._defaultGroup

    if (pts.length === 1) {
      const p = this.toCanvas(pts[0].x, pts[0].y)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      this.ctx.fillStyle = s.current ? c.fill : c.stroke
      this.ctx.fill()
      return
    }

    this.ctx.beginPath()
    const p0 = this.toCanvas(pts[0].x, pts[0].y)
    this.ctx.moveTo(p0.x, p0.y)
    for (let j = 1; j < pts.length; j++) {
      const p = this.toCanvas(pts[j].x, pts[j].y)
      this.ctx.lineTo(p.x, p.y)
    }
    if (s.complete) {
      this.ctx.closePath()
      if (highlight) {
        this.ctx.fillStyle = c.fillHover
      } else if (s.current) {
        this.ctx.fillStyle = c.fill
      } else {
        this.ctx.fillStyle = 'rgba(0,0,0,0.04)'
      }
      this.ctx.fill('nonzero')
    }
    this.ctx.strokeStyle = c.stroke
    this.ctx.lineWidth = 2
    if (!s.complete) this.ctx.setLineDash([5, 5])
    this.ctx.stroke()
    this.ctx.setLineDash([])

    if (s.current || !s.complete) {
      for (let j = 0; j < pts.length; j++) {
        const p = this.toCanvas(pts[j].x, pts[j].y)
        this.ctx.beginPath()
        this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
        this.ctx.fillStyle = c.stroke
        this.ctx.fill()
        this.ctx.strokeStyle = '#fff'
        this.ctx.lineWidth = 1.5
        this.ctx.stroke()
        this.ctx.fillStyle = '#fff'
        this.ctx.font = 'bold 11px sans-serif'
        this.ctx.fillText(String(j + 1), p.x + 7, p.y - 7)
      }
    }
  }

  /** 绘制 bbox 裁剪后的最终二值像素点阵。 */
  _paintMask(s: MaskShape, highlight: boolean): void {
    if (s.bitmap.width <= 0 || s.bitmap.height <= 0) return
    const c = this._groups[s.group] || this._defaultGroup
    let cached = this._maskCanvasCache.get(s.id)
    if (
      !cached ||
      cached.counts !== s.bitmap.counts ||
      cached.width !== s.bitmap.width ||
      cached.height !== s.bitmap.height ||
      cached.color !== c.stroke
    ) {
      const source = document.createElement('canvas')
      source.width = s.bitmap.width
      source.height = s.bitmap.height
      const context = source.getContext('2d')!
      const pixels = decodeMaskBitmap(s.bitmap)
      const imageData = context.createImageData(source.width, source.height)
      for (let index = 0; index < pixels.length; index++) {
        if (!pixels[index]) continue
        imageData.data[index * 4] = 255
        imageData.data[index * 4 + 1] = 255
        imageData.data[index * 4 + 2] = 255
        imageData.data[index * 4 + 3] = 255
      }
      context.putImageData(imageData, 0, 0)
      context.globalCompositeOperation = 'source-in'
      context.fillStyle = c.stroke
      context.fillRect(0, 0, source.width, source.height)
      cached = {
        counts: s.bitmap.counts,
        width: s.bitmap.width,
        height: s.bitmap.height,
        color: c.stroke,
        canvas: source
      }
      this._maskCanvasCache.set(s.id, cached)
    }
    this.ctx.save()
    this.ctx.globalAlpha = highlight || s.current ? 0.46 : 0.3
    this.ctx.imageSmoothingEnabled = false
    this.ctx.setTransform(...this._viewport.canvasTransform())
    this.ctx.drawImage(cached.canvas, s.bitmap.x, s.bitmap.y)
    this.ctx.restore()
    if (s.current) {
      this.ctx.save()
      this.ctx.setTransform(...this._viewport.canvasTransform())
      this.ctx.strokeStyle = c.stroke
      this.ctx.lineWidth = 1.5 / this._viewport.scale
      this.ctx.setLineDash([6 / this._viewport.scale, 4 / this._viewport.scale])
      this.ctx.strokeRect(s.bitmap.x, s.bitmap.y, s.bitmap.width, s.bitmap.height)
      this.ctx.restore()
    }
  }

  /** 绘制由前后面组成的立方体。 */
  _paintCuboid(s: CuboidShape | LiveCuboidShape, highlight: boolean): void {
    const corners = cuboidCorners(s.points)
    if (corners.length === 0) return
    const c = this._groups[s.group] || this._defaultGroup
    if (corners.length === 1) {
      const point = this.toCanvas(corners[0].x, corners[0].y)
      this.ctx.beginPath()
      this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
      this.ctx.fillStyle = c.stroke
      this.ctx.fill()
      return
    }

    const canvasCorners = corners.map((point) => this.toCanvas(point.x, point.y))
    const drawFace = (indices: number[], alpha: number) => {
      this.ctx.beginPath()
      this.ctx.moveTo(canvasCorners[indices[0]].x, canvasCorners[indices[0]].y)
      indices
        .slice(1)
        .forEach((index) => this.ctx.lineTo(canvasCorners[index].x, canvasCorners[index].y))
      this.ctx.closePath()
      this.ctx.fillStyle = hexToRgba(c.stroke, alpha)
      this.ctx.fill()
      this.ctx.strokeStyle = c.stroke
      this.ctx.lineWidth = highlight || s.current ? 3 : 2
      if (!s.complete) this.ctx.setLineDash([5, 5])
      this.ctx.stroke()
      this.ctx.setLineDash([])
    }

    drawFace([0, 1, 2, 3], highlight || s.current ? 0.18 : 0.1)
    if (canvasCorners.length === 8) {
      drawFace([4, 5, 6, 7], highlight || s.current ? 0.13 : 0.07)
      drawFace([1, 5, 6, 2], highlight || s.current ? 0.2 : 0.12)
      drawFace([0, 4, 5, 1], highlight || s.current ? 0.24 : 0.15)
      for (let i = 0; i < 4; i++) {
        this.ctx.beginPath()
        this.ctx.moveTo(canvasCorners[i].x, canvasCorners[i].y)
        this.ctx.lineTo(canvasCorners[i + 4].x, canvasCorners[i + 4].y)
        this.ctx.strokeStyle = c.stroke
        this.ctx.lineWidth = highlight || s.current ? 3 : 2
        this.ctx.stroke()
      }
    }

    if (s.current || !s.complete) {
      s.points.forEach((source) => {
        const point = this.toCanvas(source.x, source.y)
        this.ctx.beginPath()
        this.ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
        this.ctx.fillStyle = c.stroke
        this.ctx.fill()
        this.ctx.strokeStyle = '#fff'
        this.ctx.lineWidth = 1.5
        this.ctx.stroke()
      })
    }
  }

  /** 按 COCO Person 拓扑绘制骨骼；实心点可见，空心点表示遮挡。 */
  _paintJoint(s: JointShape, highlight: boolean): void {
    if (placedJointPoints(s).length === 0) return
    const color = (this._groups[s.group] || this._defaultGroup).stroke
    this.ctx.save()
    COCO_PERSON_SKELETON.forEach(([startIndex, endIndex]) => {
      const start = s.points[startIndex]
      const end = s.points[endIndex]
      if (!start || !end || start.visibility === 0 || end.visibility === 0) return
      const canvasStart = this.toCanvas(start.x, start.y)
      const canvasEnd = this.toCanvas(end.x, end.y)
      this.ctx.beginPath()
      this.ctx.moveTo(canvasStart.x, canvasStart.y)
      this.ctx.lineTo(canvasEnd.x, canvasEnd.y)
      this.ctx.strokeStyle = color
      this.ctx.lineWidth = highlight || s.current ? 3 : 2
      if (start.visibility === 1 || end.visibility === 1) this.ctx.setLineDash([5, 4])
      this.ctx.stroke()
      this.ctx.setLineDash([])
    })
    s.points.forEach((source, index) => {
      if (source.visibility === 0) return
      const point = this.toCanvas(source.x, source.y)
      this.ctx.beginPath()
      this.ctx.arc(point.x, point.y, s.current || !s.complete ? 5 : 3.5, 0, Math.PI * 2)
      this.ctx.fillStyle = source.visibility === 1 ? '#fff' : color
      this.ctx.fill()
      this.ctx.strokeStyle = source.visibility === 1 ? color : '#fff'
      this.ctx.lineWidth = source.visibility === 1 ? 2 : 1.5
      if (source.visibility === 1) this.ctx.setLineDash([2, 2])
      this.ctx.stroke()
      this.ctx.setLineDash([])
      if (s.current || !s.complete) {
        this.ctx.fillStyle = '#fff'
        this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)'
        this.ctx.lineWidth = 3
        this.ctx.font = 'bold 10px sans-serif'
        const label = `${index + 1} ${jointPointLabel(index)}`
        this.ctx.strokeText(label, point.x + 7, point.y - 7)
        this.ctx.fillText(label, point.x + 7, point.y - 7)
      }
    })
    this.ctx.restore()
  }

  /* ---- Live rect drawing ---- */

  /** 绘制实时矩形（拖拽过程中的虚线预览框） */
  _paintLiveRect(): void {
    if (!this._liveRect) return
    const s = this._liveRect
    const center = this.toCanvas(s.x, s.y)
    const cx = center.x
    const cy = center.y
    const cw = s.w * this._viewport.scale
    const ch = s.h * this._viewport.scale

    this.ctx.save()
    this.ctx.translate(cx, cy)
    this.ctx.rotate((s.rotation || 0) + this._viewport.rotationRadians)
    this.ctx.strokeStyle = (this._groups[this._group] || this._defaultGroup).stroke
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(-cw / 2, -ch / 2, cw, ch)
    this.ctx.setLineDash([])
    this.ctx.restore()
  }

  /**
   * 设置实时矩形（拖拽预览），根据起止点计算中心/宽高
   * @param sx - 起始点画布 X 坐标
   * @param sy - 起始点画布 Y 坐标
   * @param ex - 结束点画布 X 坐标
   * @param ey - 结束点画布 Y 坐标
   */
  drawLiveRect(sx: number, sy: number, ex: number, ey: number): void {
    this._liveRect = {
      type: 'rect',
      x: (sx + ex) / 2,
      y: (sy + ey) / 2,
      w: Math.abs(ex - sx),
      h: Math.abs(ey - sy),
      rotation: 0,
      group: this._group
    }
    this.drawHistory()
  }

  /** 清除实时矩形（拖拽结束） */
  clearLiveRect(): void {
    this._liveRect = null
  }

  drawLiveEllipse(sx: number, sy: number, ex: number, ey: number): void {
    this._liveEllipse = {
      type: 'ellipse',
      x: (sx + ex) / 2,
      y: (sy + ey) / 2,
      w: Math.abs(ex - sx),
      h: Math.abs(ey - sy),
      rotation: 0,
      group: this._group
    }
    this.drawHistory()
  }

  clearLiveEllipse(): void {
    this._liveEllipse = null
  }

  /** 以矩形拉框方式预览立方体。 */
  drawLiveCuboid(sx: number, sy: number, ex: number, ey: number): void {
    this._liveCuboid = {
      type: 'cuboid',
      points: [
        { x: Math.min(sx, ex), y: Math.min(sy, ey) },
        { x: Math.max(sx, ex), y: Math.max(sy, ey) }
      ],
      complete: false,
      group: this._group
    }
    this.drawHistory()
  }

  clearLiveCuboid(): void {
    this._liveCuboid = null
  }

  drawLivePath(points: Point[], group = this._group): void {
    this._livePath = { points: points.map((point) => ({ ...point })), group }
    this.drawHistory()
  }

  clearLivePath(): void {
    this._livePath = null
  }

  drawSelectionBox(start: Point, end: Point): void {
    this._selectionBox = { start: { ...start }, end: { ...end } }
    this.drawHistory()
  }

  clearSelectionBox(): void {
    this._selectionBox = null
  }

  drawCursorPreview(start: Point, end: Point, group = this._group): void {
    this._cursorPreview = { start: { ...start }, end: { ...end }, group }
    this.drawHistory()
  }

  clearCursorPreview(): void {
    this._cursorPreview = null
  }

  setCrosshairPoint(x: number, y: number): void {
    this._crosshairPoint = { x, y }
  }

  clearCrosshairPoint(): void {
    this._crosshairPoint = null
  }

  setHoveredShape(index: number | null): void {
    const next = index === null ? -1 : index
    if (next === this._hoveredShapeIndex) return
    this._hoveredShapeIndex = next
    this.drawHistory()
  }

  private _paintGrid(): void {
    const width = this._viewport.imageWidth
    const height = this._viewport.imageHeight
    if (!this.showGrid || width <= 0 || height <= 0) return
    const step = 50
    this.ctx.save()
    this.ctx.setTransform(...this._viewport.canvasTransform())
    this.ctx.beginPath()
    this.ctx.rect(0, 0, width, height)
    this.ctx.clip()
    this.ctx.beginPath()
    for (let x = 0; x <= width; x += step) {
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, height)
    }
    for (let y = 0; y <= height; y += step) {
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(width, y)
    }
    this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.3)'
    this.ctx.lineWidth = 1 / this._viewport.scale
    this.ctx.stroke()
    this.ctx.restore()
  }

  private _paintCrosshair(): void {
    if (!this.showCrosshair || !this._crosshairPoint) return
    const { x, y } = this._crosshairPoint
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.moveTo(0, y)
    this.ctx.lineTo(this.canvas.width, y)
    this.ctx.moveTo(x, 0)
    this.ctx.lineTo(x, this.canvas.height)
    this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.62)'
    this.ctx.lineWidth = 3
    this.ctx.stroke()
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([6, 4])
    this.ctx.stroke()
    this.ctx.restore()
  }

  private _paintCursorPreview(): void {
    if (!this._cursorPreview) return
    const start = this.toCanvas(this._cursorPreview.start.x, this._cursorPreview.start.y)
    const end = this.toCanvas(this._cursorPreview.end.x, this._cursorPreview.end.y)
    const color = (this._groups[this._cursorPreview.group] || this._defaultGroup).stroke
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.moveTo(start.x, start.y)
    this.ctx.lineTo(end.x, end.y)
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 4])
    this.ctx.stroke()
    this.ctx.restore()
  }

  private _paintSelectionBox(): void {
    if (!this._selectionBox) return
    const { start, end } = this._selectionBox
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(37, 99, 235, 0.1)'
    this.ctx.strokeStyle = '#2563eb'
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([5, 3])
    this.ctx.fillRect(x, y, width, height)
    this.ctx.strokeRect(x + 0.5, y + 0.5, width, height)
    this.ctx.restore()
  }

  private _paintLivePath(): void {
    if (!this._livePath || this._livePath.points.length === 0) return
    const color = (this._groups[this._livePath.group] || this._defaultGroup).stroke
    const points = this._livePath.points.map((point) => this.toCanvas(point.x, point.y))
    this.ctx.save()
    this.ctx.strokeStyle = color
    this.ctx.fillStyle = '#fff'
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([5, 4])
    this.ctx.beginPath()
    this.ctx.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((point) => this.ctx.lineTo(point.x, point.y))
    this.ctx.stroke()
    this.ctx.setLineDash([])
    points.forEach((point) => {
      this.ctx.beginPath()
      this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.stroke()
    })
    this.ctx.restore()
  }
}
