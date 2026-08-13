import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { createTestDb, seedBasics } from '../helpers/tmp-db';
import { Db } from '../../src/main/db/database';

describe('backup prin SQLite Online Backup API', () => {
  it('creează o copie consistentă și restaurabilă', async () => {
    const t = createTestDb();
    try {
      seedBasics(t.db);
      const backupFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-bk-')), 'bk.sqlite');

      await backup(t.db.raw, backupFile);

      // Verificare integritate + conținut pe copia restaurată.
      const restored = new DatabaseSync(backupFile, { readOnly: true });
      const integrity = restored.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      expect(integrity.integrity_check).toBe('ok');
      const count = restored.prepare('SELECT COUNT(*) AS n FROM associations').get() as {
        n: number;
      };
      expect(count.n).toBe(1);
      restored.close();

      // Modificăm baza live după backup; copia rămâne neschimbată (snapshot consistent).
      t.db.run(`INSERT INTO associations (name, address) VALUES ('Alta', 'Adresa')`);
      const restored2 = new DatabaseSync(backupFile, { readOnly: true });
      const count2 = restored2.prepare('SELECT COUNT(*) AS n FROM associations').get() as {
        n: number;
      };
      expect(count2.n).toBe(1);
      restored2.close();
      fs.rmSync(path.dirname(backupFile), { recursive: true, force: true });
    } finally {
      t.cleanup();
    }
  });

  it('restore: copia poate înlocui baza și rămâne funcțională', async () => {
    const t = createTestDb();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-restore-'));
    try {
      seedBasics(t.db);
      const backupFile = path.join(dir, 'bk.sqlite');
      await backup(t.db.raw, backupFile);

      // Simulăm restore: închidem, copiem peste, redeschidem.
      const liveFile = t.file;
      t.db.close();
      fs.copyFileSync(backupFile, liveFile);

      const reopened = new Db(liveFile);
      const row = reopened.get<{ name: string }>('SELECT name FROM associations LIMIT 1');
      expect(row!.name).toBe('Asociația Bloc A7');
      reopened.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      t.cleanup();
    }
  });
});
