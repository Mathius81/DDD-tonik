import type { AppContext } from '../app-context';
import type { MessagingService } from '../services/messaging/messaging.service';
import type { DailyDigestService } from '../services/daily-digest.service';
import type { SecretsService } from '../services/secrets.service';
import type { StartupService } from '../services/startup.service';
import type { BackupService } from '../services/backup.service';
import type { Db } from '../db/database';
import type { LicenseService } from '../services/license.service';
import { setIpcLogger } from './register';
import { registerAssociationHandlers } from './associations.ipc';
import { registerContactHandlers } from './contacts.ipc';
import { registerServiceHandlers } from './services.ipc';
import { registerInterventionHandlers } from './interventions.ipc';
import { registerFollowupHandlers } from './followups.ipc';
import { registerDashboardHandlers } from './dashboard.ipc';
import { registerMessageHandlers } from './messages.ipc';
import { registerReminderHandlers } from './reminders.ipc';
import { registerSettingsHandlers } from './settings.ipc';
import { registerBackupHandlers } from './backup.ipc';
import { registerLicenseHandlers } from './license.ipc';

export interface IpcDependencies {
  messaging: MessagingService;
  digest: DailyDigestService;
  secrets: SecretsService;
  startup: StartupService;
  backups: BackupService;
  license: LicenseService;
  reopenDb: (db: Db) => void;
}

export function registerAllIpcHandlers(ctx: AppContext, deps: IpcDependencies): void {
  setIpcLogger(ctx.logger);
  registerAssociationHandlers(ctx);
  registerContactHandlers(ctx);
  registerServiceHandlers(ctx);
  registerInterventionHandlers(ctx);
  registerFollowupHandlers(ctx);
  registerDashboardHandlers(ctx);
  registerMessageHandlers(ctx, deps.messaging);
  registerReminderHandlers(ctx);
  registerSettingsHandlers(ctx, deps.secrets, deps.messaging, deps.startup, deps.digest);
  registerBackupHandlers(ctx, deps.backups, deps.reopenDb);
  registerLicenseHandlers(ctx, deps.license);
}
