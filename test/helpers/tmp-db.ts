import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Db } from '../../src/main/db/database';
import { runMigrations } from '../../src/main/db/migrations';

/** Creează o bază SQLite temporară cu toate migrațiile aplicate. */
export function createTestDb(): { db: Db; file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-test-'));
  const file = path.join(dir, 'test.sqlite');
  const db = new Db(file);
  runMigrations(db);
  return {
    db,
    file,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // deja închisă
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Creează asociație + contact + serviciu de test; întoarce id-urile. */
export function seedBasics(db: Db): { associationId: number; contactId: number; serviceId: number } {
  const a = db.run(
    `INSERT INTO associations (name, address) VALUES ('Asociația Bloc A7', 'Str. Exemplu nr. 10')`,
  );
  const associationId = Number(a.lastInsertRowid);
  const c = db.run(
    `INSERT INTO contacts (association_id, name, role, phone, email, is_primary)
     VALUES (?, 'Ion Popescu', 'Administrator', '0712345678', 'ion@example.ro', 1)`,
    associationId,
  );
  const s = db.get<{ id: number }>(`SELECT id FROM services WHERE name = 'Dezinsecție'`);
  return { associationId, contactId: Number(c.lastInsertRowid), serviceId: s!.id };
}
