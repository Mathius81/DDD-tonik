/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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
import { registerCarpetHandlers } from './carpets.ipc';
import { registerTyreHandlers } from './tyres.ipc';
import { registerAboutHandlers } from './about.ipc';

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
  registerCarpetHandlers(ctx);
  registerTyreHandlers(ctx);
  registerAboutHandlers(ctx, deps.license);
}
