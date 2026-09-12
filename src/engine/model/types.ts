export type ModeType =
  | 'rect'
  | 'point'
  | 'polyline'
  | 'polygon'
  | 'curve'
  | 'ellipse'
  | 'mask'
  | 'cuboid'
  | 'joint'
  | 'sam'
export type InteractionMode = 'select' | 'draw'
export type MaskTool = 'brush' | 'eraser' | 'polygon' | 'inverse-polygon' | 'merge'
export type AuxiliaryTool = 'move' | 'reshape-path' | 'clip-path' | 'merge-polygons'

export interface Point {
  x: number
  y: number
}

export interface Group {
  name: string
  stroke: string
  fill: string
  fillHover: string
  label: string
}

/** 所有标注对象共享的稳定标识与展示状态。 */
export interface ShapeBase {
  /** RFC 4122 UUID；创建后在编辑、撤销、转换及保存过程中保持不变。 */
  id: string
  group: string
  current?: boolean
  hidden?: boolean
}

export interface RectShape extends ShapeBase {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface PointShape extends ShapeBase {
  type: 'point'
  x: number
  y: number
}

export interface PolylineShape extends ShapeBase {
  type: 'polyline'
  points: Point[]
  complete: boolean
}

export interface PolygonShape extends ShapeBase {
  type: 'polygon'
  points: Point[]
  complete: boolean
}

/** 经过控制点的平滑 Catmull-Rom 曲线。 */
export interface CurveShape extends ShapeBase {
  type: 'curve'
  points: Point[]
  complete: boolean
}

/** 可旋转的圆形/椭圆；w === h 时为圆形。 */
export interface EllipseShape extends ShapeBase {
  type: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface MaskStrokeOperation {
  kind: 'stroke'
  operation: 'paint' | 'erase'
  points: Point[]
  size: number
}

export interface MaskPolygonOperation {
  kind: 'polygon'
  operation: 'paint' | 'subtract'
  points: Point[]
}

export type MaskOperation = MaskStrokeOperation | MaskPolygonOperation

/** bbox 裁剪后的最终二值像素点阵；counts 为行优先、从 0 开始交替的 RLE。 */
export interface MaskBitmap {
  x: number
  y: number
  width: number
  height: number
  counts: number[]
}

/** 位图遮罩只持久化最终像素点阵，不保存绘制操作路径。 */
export interface MaskShape extends ShapeBase {
  type: 'mask'
  bitmap: MaskBitmap
}

/**
 * 立方体标注。
 * 创建时由“背景面左上 → 前景面右下”拉框生成；完成后 points 保存 8 个可独立编辑的顶点。
 */
export interface CuboidShape extends ShapeBase {
  type: 'cuboid'
  points: Point[]
  complete: boolean
}

export type JointVisibility = 0 | 1 | 2

/** COCO 人体关键点；0=缺失，1=已标注但遮挡，2=可见。 */
export interface JointPoint extends Point {
  name: string
  visibility: JointVisibility
}

/** COCO Person 17 点人体骨架，骨骼连接由 skeleton 模型定义。 */
export interface JointShape extends ShapeBase {
  type: 'joint'
  skeleton: 'coco-person-17'
  points: JointPoint[]
  nextPointIndex: number
  complete: boolean
}

export type Shape =
  | RectShape
  | PointShape
  | PolylineShape
  | PolygonShape
  | CurveShape
  | EllipseShape
  | MaskShape
  | CuboidShape
  | JointShape

export interface ImageAdjustments {
  brightness: number
  contrast: number
  saturation: number
}

export interface Meta {
  scale: number
  translateX: number
  translateY: number
  mode: string
  group: string
  maskTool?: MaskTool
  maskBrushSize?: number
  imageAdjustments?: ImageAdjustments
  showLabels?: boolean
  showGrid?: boolean
  showCrosshair?: boolean
  rotation?: number
}

export interface VertexHit {
  shapeIdx: number
  vertexIdx: number
}

export type Handle = 'TL' | 'TR' | 'BL' | 'BR' | 'T' | 'B' | 'L' | 'R' | 'ROTATE' | 'OUT'

export interface DragCache {
  x: number
  y: number
  w?: number
  h?: number
  rotation?: number
  points?: Point[]
  bitmap?: MaskBitmap
}

export interface ControllerState {
  drawing: boolean
  dragging: boolean
  resizing: boolean
  panning: boolean
  rotating: boolean
  /** 是否正在选择模式中拖出多选框。 */
  selecting: boolean
  dragIdx: number
  dragVertexIdx: number
  /** 立方体整面拖动时，被同时调整的 4 个顶点。 */
  dragFaceVertexIndices: number[] | null
  dragCache: DragCache | null
  dragStart: Point | null
  resizeDirection: Handle
  resizeCache: { x: number; y: number; w: number; h: number; rotation: number } | null
  resizeStartLocal: Point | null
  rotateCache: { rotation: number } | null
  rotateStartAngle: number | null
  offsetAngle: number | null
  panStart: Point | null
  drawStart: Point | null
  selectStart: Point | null
}

export interface HandlerReturn {
  onMouseDown: (_e: MouseEvent) => void
  onMouseMove: (_e: MouseEvent) => void
  onMouseUp: (_e: MouseEvent) => void
  onMouseLeave: (_e: MouseEvent) => void
  onWheel: (_e: WheelEvent) => void
}

export interface ControllerOpts {
  mode?: string
  interactionMode?: InteractionMode
  readonly?: boolean
  onChange?: (_shapes: Shape[], _meta: Meta) => void
  onViewportChange?: () => void
  groups?: Group[]
}
