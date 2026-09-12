export function formatFilename(name: string, maxLen = 30): string {
  if (name.length <= maxLen) return name
  const ext = name.lastIndexOf('.')
  if (ext === -1) return name.slice(0, maxLen - 3) + '...'
  const extPart = name.slice(ext)
  const namePart = name.slice(0, ext)
  const maxNameLen = maxLen - extPart.length - 3
  if (maxNameLen <= 0) return name.slice(0, maxLen - 3) + '...'
  return namePart.slice(0, maxNameLen) + '...' + extPart
}
