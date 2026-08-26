/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Structura de date în userData:
 *   data/ddd-manager.sqlite
 *   backups/
 *   logs/
 */
export interface AppPaths {
  dataDir: string;
  backupsDir: string;
  logsDir: string;
  dbFile: string;
}

export function resolveAppPaths(userDataDir: string = app.getPath('userData')): AppPaths {
  const dataDir = path.join(userDataDir, 'data');
  const backupsDir = path.join(userDataDir, 'backups');
  const logsDir = path.join(userDataDir, 'logs');
  for (const dir of [dataDir, backupsDir, logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return { dataDir, backupsDir, logsDir, dbFile: path.join(dataDir, 'ddd-manager.sqlite') };
}
