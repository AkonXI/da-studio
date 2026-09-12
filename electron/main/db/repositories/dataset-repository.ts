import { execute, getDb, queryAll, run } from '../connection'

export interface DatasetRow {
  id: number
  name: string
  description: string
  tools: string
  groups: string
  created_at: string
}

export function listDatasets(): DatasetRow[] {
  return queryAll<DatasetRow>('SELECT * FROM datasets ORDER BY created_at DESC')
}

export function createDataset(name: string, description: string, tools: string, groups: string) {
  return {
    id: execute('INSERT INTO datasets (name, description, tools, groups) VALUES (?, ?, ?, ?)', [
      name,
      description,
      tools,
      groups
    ]),
    name,
    description,
    tools,
    groups,
    created_at: new Date().toISOString()
  }
}

export function updateDataset(
  id: number,
  name: string,
  description: string,
  tools: string,
  groups: string
): void {
  run('UPDATE datasets SET name = ?, description = ?, tools = ?, groups = ? WHERE id = ?', [
    name,
    description,
    tools,
    groups,
    id
  ])
}

export function deleteDataset(id: number): void {
  const db = getDb()
  db.transaction((datasetId: number) => {
    db.prepare(
      'DELETE FROM annotations WHERE image_id IN (SELECT id FROM images WHERE dataset_id = ?)'
    ).run(datasetId)
    db.prepare('DELETE FROM images WHERE dataset_id = ?').run(datasetId)
    db.prepare('DELETE FROM datasets WHERE id = ?').run(datasetId)
  })(id)
}
