import type { AnnotationShortcutAction } from '../../shortcuts'
import type { AuxiliaryTool, MaskTool, ModeType } from '../../engine/model/types'

export function modeShortcutAction(mode: ModeType): AnnotationShortcutAction {
  return `tool-${mode}` as AnnotationShortcutAction
}

export function groupShortcutAction(index: number): AnnotationShortcutAction {
  return `group-${index + 1}` as AnnotationShortcutAction
}

export function auxiliaryShortcutAction(tool: AuxiliaryTool): AnnotationShortcutAction | null {
  if (tool === 'move') return null
  return {
    'reshape-path': 'aux-reshape',
    'clip-path': 'aux-clip',
    'merge-polygons': 'aux-merge'
  }[tool] as AnnotationShortcutAction
}

export function maskShortcutAction(tool: MaskTool): AnnotationShortcutAction {
  return {
    brush: 'mask-brush',
    eraser: 'mask-eraser',
    polygon: 'mask-polygon',
    'inverse-polygon': 'mask-inverse',
    merge: 'mask-merge'
  }[tool] as AnnotationShortcutAction
}
