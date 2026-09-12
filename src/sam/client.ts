import type { SamPrompt, SamWorkerPayload, SamWorkerRequest, SamWorkerResponse } from './types'

interface PendingRequest {
  resolve: (value: SamWorkerResponse) => void
  reject: (error: Error) => void
}

export class SamWorkerDisposedError extends Error {
  constructor() {
    super('SAM worker disposed')
    this.name = 'SamWorkerDisposedError'
  }
}

export function isSamWorkerDisposedError(error: unknown): boolean {
  return error instanceof SamWorkerDisposedError
}

export class LocalSamClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  onProgress: ((progress: number | null, file?: string) => void) | null = null

  private ensureWorker(): Worker {
    if (this.disposed) throw new SamWorkerDisposedError()
    if (this.worker) return this.worker
    this.worker = new Worker(new URL('./sam.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<SamWorkerResponse>) => {
      const response = event.data
      if (response.type === 'progress') {
        this.onProgress?.(response.progress ?? null, response.file)
        return
      }
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.type === 'error') pending.reject(new Error(response.message))
      else pending.resolve(response)
    }
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'SAM worker failed')
      this.pending.forEach(({ reject }) => reject(error))
      this.pending.clear()
    }
    return this.worker
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation)
    this.queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private request(message: SamWorkerPayload): Promise<SamWorkerResponse> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        worker.postMessage({ ...message, id } as SamWorkerRequest)
      } catch (error) {
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async load(image: string): Promise<{ width: number; height: number }> {
    const response = await this.enqueue(() => this.request({ type: 'load', image }))
    if (response.type !== 'loaded') throw new Error('Unexpected SAM load response')
    return { width: response.width, height: response.height }
  }

  async decode(prompts: SamPrompt[]) {
    // Vue ref 中的数组及其元素可能是 Proxy，Worker 的结构化克隆无法处理 Proxy。
    const plainPrompts = prompts.map(({ x, y, label }) => ({
      x: Number(x),
      y: Number(y),
      label
    }))
    const response = await this.enqueue(() =>
      this.request({ type: 'decode', prompts: plainPrompts })
    )
    if (response.type !== 'decoded') throw new Error('Unexpected SAM decode response')
    return response
  }

  async reset(): Promise<void> {
    if (!this.worker) return
    await this.enqueue(() => this.request({ type: 'reset' }))
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker?.terminate()
    this.worker = null
    this.pending.forEach(({ reject }) => reject(new SamWorkerDisposedError()))
    this.pending.clear()
  }
}

export type { SamPrompt }
