export { DEFAULT_GROUPS, buildGroupMap, deepCopy, createShapeId, ensureShapeIds } from './shared/utils'
export { Viewport } from './interaction/viewport'
export { ImageLayer } from './rendering/image-layer'
export { ShapeLayer } from './rendering/shape-layer'
export { AnnotationController } from './interaction/controller'
export { sampleCurve, sampleEllipse } from './geometry/curve'
export { splitPolygonWithPath, splitPolylineAtCuts } from './geometry/path-split'
export {
  emptyMaskBitmap,
  decodeMaskBitmap,
  encodeMaskPixels,
  applyMaskOperation,
  mergeMaskBitmaps,
  maskBitmapContains,
  maskBitmapRegionCount,
  maskBitmapFromPixels
} from './mask/bitmap'
export { maskBitmapToPolygons } from './mask/vectorize'
export type { PathCut } from './geometry/path-split'
export type {
  ModeType,
  InteractionMode,
  MaskTool,
  AuxiliaryTool,
  Point,
  Group,
  ShapeBase,
  RectShape,
  PointShape,
  PolylineShape,
  PolygonShape,
  CurveShape,
  EllipseShape,
  MaskStrokeOperation,
  MaskPolygonOperation,
  MaskOperation,
  MaskBitmap,
  MaskShape,
  CuboidShape,
  JointVisibility,
  JointPoint,
  JointShape,
  Shape,
  Meta,
  ImageAdjustments,
  VertexHit,
  Handle,
  DragCache,
  ControllerState,
  HandlerReturn,
  ControllerOpts
} from './model/types'
