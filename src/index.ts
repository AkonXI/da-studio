export { default as CanvasAnnotator } from './components/CanvasAnnotator.vue'
export { default as ComparisonPanel } from './components/ComparisonPanel.vue'
export { default as ComparisonOverlay } from './components/ComparisonOverlay.vue'
export { default as ModeIcon } from './components/ModeIcon.vue'
export { default as ToolIcon } from './components/ToolIcon.vue'
export { useComparison, comparableShapes } from './composables/useComparison'
export { DEFAULT_GROUPS, createShapeId, ensureShapeIds } from './engine/shared/utils'
export { splitPolygonWithPath, splitPolylineAtCuts } from './engine/geometry/path-split'
export {
  emptyMaskBitmap,
  decodeMaskBitmap,
  encodeMaskPixels,
  applyMaskOperation,
  mergeMaskBitmaps,
  maskBitmapContains,
  maskBitmapRegionCount,
  maskBitmapFromPixels
} from './engine/mask/bitmap'
export { maskBitmapToPolygons } from './engine/mask/vectorize'
export type { PathCut } from './engine/geometry/path-split'
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
} from './engine/model/types'
export { matchTrajectory, resample, computeBBox, computeOBB, dist2, dist } from './matcher'
export type { BBox, OBB, MatchResult, MatcherOptions } from './matcher'
