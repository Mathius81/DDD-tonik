import type { Db } from '../database';
import { migration001 } from './001_initial';

export interface Migration {
  version: number;
  name: string;
  up: (db: Db) => void;
}

export const migrations: Migration[] = [migration001];

/**
 * Rulează migrațiile lipsă, fiecare în propria tranzacție.
 * Returnează versiunile aplicate acum.
 */
export function runMigrations(db: Db): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version),
  );

  const appliedNow: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up(db);
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', m.version, m.name);
    });
    appliedNow.push(m.version);
  }
  return appliedNow;
}

export function currentSchemaVersion(db: Db): number {
  const row = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  return row?.v ?? 0;
}
