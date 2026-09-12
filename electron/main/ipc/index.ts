import { registerAnnotationIpcHandlers } from './annotation'
import { registerDatasetIpcHandlers } from './dataset'
import { registerExportIpcHandlers } from './export'
import { registerImageIpcHandlers } from './image'
export function registerIpcHandlers(): void {
  registerDatasetIpcHandlers()
  registerImageIpcHandlers()
  registerAnnotationIpcHandlers()
  registerExportIpcHandlers()
}
