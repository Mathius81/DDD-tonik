import { dialog } from 'electron';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import { settingsSchema, setSecretSchema } from '../../shared/schemas/settings';
import type { AppContext } from '../app-context';
import type { SecretsService } from '../services/secrets.service';
import type { MessagingService } from '../services/messaging/messaging.service';
import type { StartupService } from '../services/startup.service';
import type { DailyDigestService } from '../services/daily-digest.service';

export function registerSettingsHandlers(
  ctx: AppContext,
  secrets: SecretsService,
  messaging: MessagingService,
  startup: StartupService,
  digest: DailyDigestService,
): void {
  handle(IPC.settings.get, null, () => ctx.settings.get());

  handle(IPC.settings.update, settingsSchema, (settings) => {
    ctx.settings.save(settings);
    // Aplicăm imediat setarea de pornire cu Windows.
    startup.apply(settings.app.launch_at_startup);
    return ctx.settings.get();
  });

  handle(IPC.settings.setSecret, setSecretSchema, ({ key, value }) => {
    secrets.set(key, value);
    ctx.logger.info(`Secret actualizat: ${key}`);
    return { saved: true };
  });

  // Trimite raportul zilei pe loc, pentru verificare din Setări.
  handle(IPC.settings.sendDigestNow, null, async () => {
    const settings = ctx.settings.get();
    if (!settings.daily_digest.email) {
      throw new UserFacingError('Completează mai întâi adresa de email a raportului.');
    }
    if (!settings.smtp.host) {
      throw new UserFacingError('Configurează mai întâi emailul (Setări → Email).');
    }
    await digest.send(settings.daily_digest.email, ctx.todayIso());
    return { sent: true };
  });

  handle(IPC.settings.testSmtp, null, async () => {
    try {
      await messaging.emailProvider().verify();
      return { ok: true };
    } catch (err) {
      ctx.logger.warn('Test SMTP eșuat', err);
      throw new UserFacingError(
        'Conexiunea SMTP a eșuat. Verifică serverul, portul, utilizatorul și parola.',
      );
    }
  });

  // Folderul de backup se alege printr-un dialog nativ; renderer-ul nu trimite
  // niciodată căi de filesystem (spec #5).
  handle(IPC.settings.chooseBackupFolder, null, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Alege folderul pentru backup-uri',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { folder: null };
    const settings = ctx.settings.get();
    ctx.settings.save({
      ...settings,
      backup: { ...settings.backup, custom_folder: result.filePaths[0] },
    });
    return { folder: result.filePaths[0] };
  });
}
