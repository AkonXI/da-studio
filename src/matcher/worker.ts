/**
 * Web Worker — 将比对算法的 O(n×m) 计算移出主线程
 */
import { matchTrajectory } from './matcher'

self.onmessage = (e: MessageEvent) => {
  const { curveA, curveB, options, requestId } = e.data
  try {
    const result = matchTrajectory(curveA, curveB, options)
    self.postMessage({ requestId, result })
  } catch (err: any) {
    self.postMessage({ requestId, error: err.message })
  }
}
