import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

const DB_PATH = path.join(app.getPath('userData'), 'lebloc.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema()
  }
  return db
}

function initializeSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  db.exec(schema)
}

export function query(sql: string, params?: unknown[]) {
  return db.prepare(sql).all(params || [])
}

export function run(sql: string, params?: unknown[]) {
  return db.prepare(sql).run(params || [])
}

export function get(sql: string, params?: unknown[]) {
  return db.prepare(sql).get(params || [])
}
