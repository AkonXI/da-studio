import type { Point } from '../engine/model/types'

export interface BBox {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

export interface OBB {
  corners: Point[]
  diagonal: number
}

export interface MatcherOptions {
  spacing?: number
  delta?: number
  pct?: number
  closed?: boolean
}

export interface MatchResult {
  resampledA: Point[]
  resampledB: Point[]
  bbox: BBox
  diagonal: number
  eMax: number
  delta: number
  maxError: number
  violations: Point[]
  coverage: number
  similarity: number
  maxErrorPass: boolean
  similarityPass: boolean
  obb: OBB
}
