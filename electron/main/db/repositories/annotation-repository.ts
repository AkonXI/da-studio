import { queryOne, run, queryAll } from '../connection'

interface AnnotationRow {
  id: number
  image_id: number
  shapes: string
  meta: string
  updated_at: string
}

interface AnnotationJoinRow {
  image_id: number
  image_md5: string
  image_name: string
  image_filename: string
  image_width: number
  image_height: number
  shapes: string
  meta: string
}

export function getAnnotation(imageId: number): AnnotationRow | undefined {
  return queryOne<AnnotationRow>('SELECT * FROM annotations WHERE image_id = ?', [imageId])
}
export function saveAnnotation(imageId: number, shapes: string, meta: string): void {
  if (getAnnotation(imageId))
    run(
      "UPDATE annotations SET shapes = ?, meta = ?, updated_at = datetime('now') WHERE image_id = ?",
      [shapes, meta, imageId]
    )
  else
    run(
      "INSERT INTO annotations (image_id, shapes, meta, updated_at) VALUES (?, ?, ?, datetime('now'))",
      [imageId, shapes, meta]
    )
}
export function getDatasetAnnotations(datasetId: number): AnnotationJoinRow[] {
  return queryAll<AnnotationJoinRow>(
    'SELECT a.image_id, i.md5 AS image_md5, i.original_name AS image_name, i.filename AS image_filename, i.width AS image_width, i.height AS image_height, a.shapes, a.meta FROM annotations a JOIN images i ON i.id = a.image_id WHERE i.dataset_id = ? AND a.shapes != ? ORDER BY i.created_at ASC',
    [datasetId, '[]']
  )
}
export function getAnnotationStatuses(
  datasetId: number
): { image_id: number; annotated: boolean; skipped: boolean }[] {
  return queryAll<{ image_id: number; annotated: number; skipped: number }>(
    "SELECT i.id AS image_id, CASE WHEN a.id IS NOT NULL AND a.shapes != '[]' THEN 1 ELSE 0 END AS annotated, CASE WHEN a.id IS NOT NULL AND a.shapes = '[]' AND json_extract(a.meta, '$.skipped') = 1 THEN 1 ELSE 0 END AS skipped FROM images i LEFT JOIN annotations a ON a.image_id = i.id WHERE i.dataset_id = ? ORDER BY i.created_at ASC",
    [datasetId]
  ).map((r) => ({
    image_id: r.image_id,
    annotated: Boolean(r.annotated),
    skipped: Boolean(r.skipped)
  }))
}
export function saveSkip(imageId: number): void {
  saveAnnotation(imageId, '[]', JSON.stringify({ skipped: true }))
}
