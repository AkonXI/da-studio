export interface SamPrompt {
  x: number
  y: number
  label: 0 | 1
}

export type SamWorkerPayload =
  | { type: 'load'; image: string }
  | { type: 'decode'; prompts: SamPrompt[] }
  | { type: 'reset' }

export type SamWorkerRequest = SamWorkerPayload & { id: number }

export type SamWorkerResponse =
  | { id: number; type: 'progress'; progress?: number; file?: string }
  | { id: number; type: 'loaded'; width: number; height: number }
  | { id: number; type: 'decoded'; width: number; height: number; pixels: Uint8Array; score: number }
  | { id: number; type: 'reset' }
  | { id: number; type: 'error'; message: string }
