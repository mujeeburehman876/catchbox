import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

// In test mode we always use an isolated in-memory DB so tests are
// deterministic and never touch dev/demo data.
const isTest = process.env.NODE_ENV === 'test';
const dbFile = isTest ? ':memory:' : (process.env.DATABASE_FILE || './data/dev.sqlite3');

if (!isTest && dbFile !== ':memory:') {
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(sql);
}

// Tests import runMigrations() directly against the in-memory DB before use.
if (isTest) {
  runMigrations();
}
