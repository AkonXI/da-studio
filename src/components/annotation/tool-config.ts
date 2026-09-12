import type { AuxiliaryTool, MaskTool, ModeType } from '../../engine/model/types'

export const MAX_ANNOTATION_GROUPS = 16

export const ANNOTATION_GROUP_COLORS = [
  '#e53935',
  '#f9a825',
  '#1e88e5',
  '#43a047',
  '#8e24aa',
  '#00acc1',
  '#ff7043',
  '#3949ab',
  '#d81b60',
  '#7cb342',
  '#039be5',
  '#6d4c41',
  '#5e35b1',
  '#00897b',
  '#fb8c00',
  '#546e7a'
] as const

export const ANNOTATION_MODES: { type: ModeType; label: string; key: string }[] = [
  { type: 'rect', label: '矩形', key: '1' },
  { type: 'point', label: '点', key: '2' },
  { type: 'polyline', label: '折线', key: '3' },
  { type: 'polygon', label: '多边形', key: '4' },
  { type: 'curve', label: '曲线', key: '5' },
  { type: 'ellipse', label: '圆形/椭圆', key: '6' },
  { type: 'mask', label: 'Mask 遮罩', key: '7' },
  { type: 'cuboid', label: '立方体', key: '8' },
  { type: 'joint', label: '关节', key: '9' },
  { type: 'sam', label: 'SAM 分割', key: '0' }
]

export const MASK_TOOLS: { value: MaskTool; label: string }[] = [
  { value: 'brush', label: '画笔' },
  { value: 'eraser', label: '橡皮擦' },
  { value: 'polygon', label: '多边形创建 Mask' },
  { value: 'inverse-polygon', label: '多边形反向裁剪' },
  { value: 'merge', label: '融合 Mask' }
]

export const AUXILIARY_TOOLS: { value: AuxiliaryTool; label: string }[] = [
  { value: 'move', label: '移动' },
  { value: 'reshape-path', label: '快捷修改' },
  { value: 'clip-path', label: '路径裁剪' },
  { value: 'merge-polygons', label: '多边形合并' }
]
