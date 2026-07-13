import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

let instance: Database.Database | null = null;

export const getDatabase = (): Database.Database => {
  if (instance) return instance;
  const file = resolve(process.env.DATABASE_URL ?? '.premortem/premortem.db');
  mkdirSync(dirname(file), { recursive: true });
  instance = new Database(file);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
};

export const migrate = (db = getDatabase()): void => {
  const sql = readFileSync(resolve('packages/database/src/migrations/0001_initial.sql'), 'utf8');
  db.exec(sql);
};

export const ensureDevUser = (
  db = getDatabase(),
  userId = process.env.PREMORTEM_DEV_USER_ID ?? 'dev-user'
): string => {
  const timestamp = now();
  db.prepare('INSERT OR IGNORE INTO users (id,email,created_at,updated_at) VALUES (?,?,?,?)').run(
    userId,
    'founder@local.premortem',
    timestamp,
    timestamp
  );
  return userId;
};

export const sha256FileBuffer = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex');
export { now };
