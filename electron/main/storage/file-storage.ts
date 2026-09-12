import { app } from 'electron'
import { join, extname } from 'path'
import { copyFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { v4 as uuid } from 'uuid'

const uploadDir = join(app.getPath('userData'), 'uploads')
export function ensureUploadDir() {
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })
}
export function getUploadDir(): string {
  return uploadDir
}
export function storeFile(sourcePath: string): string {
  const dest = join(uploadDir, uuid() + extname(sourcePath))
  copyFileSync(sourcePath, dest)
  return dest.split(/[/\\]/).pop()!
}
export function computeFileMd5(filePath: string): string {
  return createHash('md5').update(readFileSync(filePath)).digest('hex')
}
export function deleteFile(filename: string): void {
  const fp = join(uploadDir, filename)
  if (existsSync(fp)) unlinkSync(fp)
}
export function getFilePath(filename: string): string {
  return join(uploadDir, filename)
}
export function getLocalFileUrl(filename: string): string {
  return `local-file://uploads/${encodeURIComponent(filename)}`
}
