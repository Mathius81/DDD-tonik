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
