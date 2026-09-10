/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { AppContext } from '../../src/main/app-context';
import { Logger } from '../../src/main/logger';
import { createTestDb } from './tmp-db';

/** Context complet pe SQLite real. Nicio cale nu atinge datele aplicației deschise. */
export function creeazaContextTest(ora = '2026-08-14T08:05:00') {
  const temporar = createTestDb();
  const director = path.dirname(temporar.file);
  const paths = {
    dataDir: director,
    backupsDir: path.join(director, 'backup-uri'),
    logsDir: path.join(director, 'jurnale'),
    dbFile: temporar.file,
  };
  fs.mkdirSync(paths.backupsDir);
  fs.mkdirSync(paths.logsDir);
  const logger = new Logger(paths.logsDir);
  const jurnal = {
    info: vi.spyOn(logger, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(logger, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(logger, 'error').mockImplementation(() => {}),
  };
  let acum = new Date(ora);
  const ctx = new AppContext(temporar.db, paths, logger, () => null, () => new Date(acum));
  return {
    ctx,
    jurnal,
    schimbaOra: (oraNoua: string) => { acum = new Date(oraNoua); },
    cleanup: () => {
      try {
        // Restore poate instala o conexiune nouă; închidem și acea conexiune.
        if (ctx.db !== temporar.db) ctx.db.close();
      } finally {
        temporar.cleanup();
      }
    },
  };
}
