/// <reference lib="webworker" />
import { AutoProcessor, RawImage, SamModel, Tensor, env } from '@huggingface/transformers'
import type { SamWorkerRequest, SamWorkerResponse } from './types'

const worker = self as unknown as DedicatedWorkerGlobalScope
const MODEL_ID = 'Xenova/slimsam-77-uniform'
env.allowLocalModels = false

let modelPromise: Promise<any> | null = null
let processorPromise: Promise<any> | null = null
let imageInputs: any = null
let imageEmbeddings: any = null
let imageWidth = 0
let imageHeight = 0

function post(response: SamWorkerResponse, transfer: Transferable[] = []) {
  worker.postMessage(response, transfer)
}

function getRuntime(requestId: number) {
  const progress_callback = (status: any) => {
    if (status?.status !== 'progress') return
    post({
      id: requestId,
      type: 'progress',
      progress: Number(status.progress) || undefined,
      file: status.file
    })
  }
  modelPromise ||= SamModel.from_pretrained(MODEL_ID, {
    dtype: 'q8',
    progress_callback
  })
  processorPromise ||= AutoProcessor.from_pretrained(MODEL_ID, { progress_callback })
  return Promise.all([modelPromise, processorPromise])
}

worker.onmessage = async (event: MessageEvent<SamWorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'reset') {
      imageInputs = null
      imageEmbeddings = null
      imageWidth = imageHeight = 0
      post({ id: request.id, type: 'reset' })
      return
    }

    const [model, processor] = await getRuntime(request.id)
    if (request.type === 'load') {
      const image = await RawImage.read(request.image)
      imageWidth = image.width
      imageHeight = image.height
      imageInputs = await processor(image)
      imageEmbeddings = await model.get_image_embeddings(imageInputs)
      post({ id: request.id, type: 'loaded', width: imageWidth, height: imageHeight })
      return
    }

    if (!imageInputs || !imageEmbeddings) throw new Error('SAM image embedding is not ready')
    if (request.prompts.length === 0) throw new Error('At least one SAM prompt is required')
    const [reshapedHeight, reshapedWidth] = imageInputs.reshaped_input_sizes[0]
    const points = request.prompts.flatMap((prompt) => [
      prompt.x * (reshapedWidth / imageWidth),
      prompt.y * (reshapedHeight / imageHeight)
    ])
    const inputPoints = new Tensor('float32', new Float32Array(points), [
      1,
      1,
      request.prompts.length,
      2
    ])
    const inputLabels = new Tensor(
      'int64',
      BigInt64Array.from(request.prompts.map((prompt) => BigInt(prompt.label))),
      [1, 1, request.prompts.length]
    )
    const outputs = await model({ ...imageEmbeddings, input_points: inputPoints, input_labels: inputLabels })
    const masks = await processor.post_process_masks(
      outputs.pred_masks,
      imageInputs.original_sizes,
      imageInputs.reshaped_input_sizes
    )
    const scores = Array.from(outputs.iou_scores.data as Float32Array)
    let best = 0
    for (let index = 1; index < scores.length; index++) {
      if (scores[index] > scores[best]) best = index
    }
    const source = masks[0].data as Uint8Array
    const planeSize = imageWidth * imageHeight
    const pixels = new Uint8Array(planeSize)
    pixels.set(source.subarray(best * planeSize, (best + 1) * planeSize))
    post(
      {
        id: request.id,
        type: 'decoded',
        width: imageWidth,
        height: imageHeight,
        pixels,
        score: scores[best] || 0
      },
      [pixels.buffer]
    )
  } catch (error) {
    post({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
