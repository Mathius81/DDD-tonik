import type { BrowserWindow } from 'electron';
import type { AppPaths } from './paths';
import type { Logger } from './logger';

export interface BootstrapContext {
  paths: AppPaths;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Punctul central de inițializare: DB, migrații, IPC, scheduler, tray.
 * Modulele se adaugă aici pe măsură ce sunt implementate.
 */
export async function bootstrap(ctx: BootstrapContext): Promise<void> {
  ctx.logger.info('Bootstrap: început');
  // Fazele următoare adaugă: openDatabase, runMigrations, registerIpcHandlers,
  // startScheduler, createTray, setupBackup.
  ctx.logger.info('Bootstrap: finalizat');
}
