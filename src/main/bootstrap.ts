import type { BrowserWindow } from 'electron';
import { Db } from './db/database';
import { runMigrations, currentSchemaVersion } from './db/migrations';
import { registerAllIpcHandlers } from './ipc';
import { AppContext } from './app-context';
import { SecretsService } from './services/secrets.service';
import { MessagingService } from './services/messaging/messaging.service';
import { NotificationService } from './services/notification.service';
import { SchedulerService } from './services/scheduler.service';
import { DailyDigestService } from './services/daily-digest.service';
import { BackupService } from './services/backup.service';
import { StartupService } from './services/startup.service';
import { LicenseService } from './services/license.service';
import { createTray } from './tray';
import type { AppPaths } from './paths';
import type { Logger } from './logger';

export interface BootstrapContext {
  paths: AppPaths;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
  quit: () => void;
}

export interface BootstrapResult {
  ctx: AppContext;
  scheduler: SchedulerService;
  backups: BackupService;
}

/** Punctul central de inițializare: DB, migrații, IPC, servicii, scheduler, tray. */
export async function bootstrap(boot: BootstrapContext): Promise<BootstrapResult> {
  boot.logger.info('Bootstrap: început');

  const db = new Db(boot.paths.dbFile);
  const ctx = new AppContext(db, boot.paths, boot.logger, boot.getMainWindow);

  const backups = new BackupService(ctx);

  // Backup de siguranță înaintea migrațiilor, dacă baza există deja (spec #49, #68).
  const version = safeSchemaVersion(db);
  const pendingMigrations = version >= 0;
  if (pendingMigrations && version > 0) {
    try {
      await backups.create();
      boot.logger.info('Backup pre-migrație creat');
    } catch (err) {
      boot.logger.warn('Backup pre-migrație eșuat (continuăm)', err);
    }
  }

  const applied = runMigrations(db);
  if (applied.length) boot.logger.info(`Migrații aplicate: ${applied.join(', ')}`);
  boot.logger.info(`Schema DB versiunea ${currentSchemaVersion(db)}`);

  const license = new LicenseService(ctx.settings, boot.logger);
  const secrets = new SecretsService(ctx.settings);
  const messaging = new MessagingService(ctx, secrets);
  const notifications = new NotificationService(ctx);
  const digest = new DailyDigestService(ctx, messaging);
  const scheduler = new SchedulerService(ctx, notifications, messaging, digest, license);
  const startup = new StartupService(boot.logger);

  registerAllIpcHandlers(ctx, {
    messaging,
    digest,
    license,
    secrets,
    startup,
    backups,
    reopenDb: (newDb: Db) => {
      ctx.db = newDb;
      rebindRepositories(ctx, newDb);
    },
  });

  // Backup automat zilnic la prima pornire din zi.
  backups.autoBackupIfNeeded().catch((err) => boot.logger.error('Backup automat eșuat', err));

  scheduler.start();
  createTray(ctx, scheduler, boot.quit);

  // Aplicăm setarea de pornire cu sistemul la fiecare start.
  startup.apply(ctx.settings.get().app.launch_at_startup);

  boot.logger.info('Bootstrap: finalizat');
  return { ctx, scheduler, backups };
}

function safeSchemaVersion(db: Db): number {
  try {
    return currentSchemaVersion(db);
  } catch {
    return 0;
  }
}

function rebindRepositories(ctx: AppContext, db: Db): void {
  // Repo-urile țin referința la Db; după restore recreăm AppContext-ul parțial.
  // Cel mai sigur: aplicația se repornește imediat după restore (vezi backup.ipc),
  // deci această rebind e doar plasă de siguranță pentru fereastra scurtă până la restart.
  (ctx as unknown as { db: Db }).db = db;
}
