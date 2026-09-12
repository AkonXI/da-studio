import { protocol, net } from 'electron'
import { existsSync } from 'fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'path'
import { platform } from 'process'
import { pathToFileURL } from 'url'
import { getUploadDir } from '../storage'

export function registerLocalFileProtocol(): void {
  protocol.handle('local-file', async (request) => {
    const fp = localFileUrlToPath(request.url)
    if (!fp) return new Response('Bad Request', { status: 400 })
    if (!isInsideUploadDir(fp)) return new Response('Forbidden', { status: 403 })
    if (existsSync(fp)) {
      // request.url 是 local-file://uploads/<filename>，直接替换协议会得到
      // file://uploads/<filename>（UNC 主机 uploads），必须使用已校验的真实路径。
      const response = await net.fetch(pathToFileURL(fp).toString(), {
        bypassCustomProtocolHandlers: true
      })
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    }
    return new Response('Not Found', { status: 404 })
  })
}
function localFileUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'local-file:' || parsed.hostname !== 'uploads') return null
    const filename = decodeURIComponent(parsed.pathname.slice(1))
    if (!filename || basename(filename) !== filename) return null
    return join(getUploadDir(), filename)
  } catch {
    return null
  }
}
function isInsideUploadDir(fp: string): boolean {
  const rel = relative(normalize(resolve(getUploadDir())), normalize(resolve(fp)))
  return Boolean(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
function normalize(p: string): string {
  return platform === 'win32' ? p.toLowerCase() : p
}
