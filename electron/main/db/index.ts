import { closeDatabase, openDatabase } from './connection'

const DEFAULT_TOOLS = JSON.stringify([
  'rect',
  'point',
  'polyline',
  'polygon',
  'curve',
  'ellipse',
  'mask',
  'cuboid'
])
const DEFAULT_GROUPS = JSON.stringify([
  {
    id: '1',
    name: 'red',
    stroke: '#e53935',
    fill: 'rgba(229,57,53,0.12)',
    fillHover: 'rgba(229,57,53,0.04)',
    label: '红'
  },
  {
    id: '2',
    name: 'yellow',
    stroke: '#f9a825',
    fill: 'rgba(249,168,37,0.12)',
    fillHover: 'rgba(249,168,37,0.04)',
    label: '黄'
  },
  {
    id: '3',
    name: 'blue',
    stroke: '#1e88e5',
    fill: 'rgba(30,136,229,0.12)',
    fillHover: 'rgba(30,136,229,0.04)',
    label: '蓝'
  },
  {
    id: '4',
    name: 'green',
    stroke: '#43a047',
    fill: 'rgba(67,160,71,0.12)',
    fillHover: 'rgba(67,160,71,0.04)',
    label: '绿'
  }
])

export function initDatabase(): void {
  const db = openDatabase()
  db.exec(
    `CREATE TABLE IF NOT EXISTS datasets (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT DEFAULT '',tools TEXT DEFAULT '${DEFAULT_TOOLS}',groups TEXT DEFAULT '${DEFAULT_GROUPS}',created_at TEXT DEFAULT (datetime('now')))`
  )
  db.exec(
    `CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT,dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,filename TEXT NOT NULL,original_name TEXT NOT NULL,md5 TEXT DEFAULT '',width INTEGER DEFAULT 0,height INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')))`
  )
  const imageColumns = db.prepare('PRAGMA table_info(images)').all() as { name: string }[]
  if (!imageColumns.some((column) => column.name === 'width')) {
    db.exec('ALTER TABLE images ADD COLUMN width INTEGER DEFAULT 0')
  }
  if (!imageColumns.some((column) => column.name === 'height')) {
    db.exec('ALTER TABLE images ADD COLUMN height INTEGER DEFAULT 0')
  }
  db.exec(
    `CREATE TABLE IF NOT EXISTS annotations (id INTEGER PRIMARY KEY AUTOINCREMENT,image_id INTEGER NOT NULL UNIQUE REFERENCES images(id) ON DELETE CASCADE,shapes TEXT DEFAULT '[]',meta TEXT DEFAULT '{}',updated_at TEXT DEFAULT (datetime('now')))`
  )
}

export { closeDatabase }
export * from './repositories/annotation-repository'
export * from './repositories/dataset-repository'
export * from './repositories/image-repository'
