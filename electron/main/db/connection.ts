import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database
export function openDatabase(): Database.Database {
  db = new Database(join(app.getPath('userData'), 'data.db'))
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  return db
}
export function closeDatabase() {
  if (db?.open) db.close()
}
export function getDb(): Database.Database {
  if (!db) throw new Error('Database has not been initialized')
  return db
}
export function queryAll<T>(sql: string, params?: unknown[]): T[] {
  return getDb()
    .prepare(sql)
    .all(...(params ?? [])) as T[]
}
export function queryOne<T>(sql: string, params?: unknown[]): T | undefined {
  return getDb()
    .prepare(sql)
    .get(...(params ?? [])) as T | undefined
}
export function execute(sql: string, params?: unknown[]): number {
  return Number(
    getDb()
      .prepare(sql)
      .run(...(params ?? [])).lastInsertRowid
  )
}
export function run(sql: string, params?: unknown[]): void {
  getDb()
    .prepare(sql)
    .run(...(params ?? []))
}
