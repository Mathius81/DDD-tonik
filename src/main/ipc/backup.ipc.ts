import { z } from 'zod';
import { app } from 'electron';
import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import type { AppContext } from '../app-context';
import type { BackupService } from '../services/backup.service';
import type { Db } from '../db/database';

const restoreSchema = z.object({
  // Doar numele fișierului; calea e rezolvată în main, în folderul de backup.
  file: z.string().min(1).max(200),
});

export function registerBackupHandlers(
  ctx: AppContext,
  backups: BackupService,
  reopenDb: (db: Db) => void,
): void {
  handle(IPC.backup.create, null, () => backups.create());
  handle(IPC.backup.list, null, () => backups.list());
  handle(IPC.backup.restore, restoreSchema, async ({ file }) => {
    await backups.restore(file, reopenDb, () => {
      app.relaunch();
      app.quit();
    });
    return { restored: true };
  });
}
