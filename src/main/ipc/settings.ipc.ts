import { dialog } from 'electron';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  settingsSchema,
  setSecretSchema,
  whatsappTemplateMapUpsertSchema,
  whatsappTemplateMapDeleteSchema,
} from '../../shared/schemas/settings';
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
    const active = settings.daily_digest.recipients.filter((r) => r.active && r.email);
    if (active.length === 0) {
      throw new UserFacingError('Adaugă mai întâi cel puțin un email activ.');
    }
    if (!settings.smtp.host) {
      throw new UserFacingError('Configurează mai întâi emailul (Setări → Email).');
    }
    for (const r of active) {
      await digest.send(r.email, ctx.todayIso());
    }
    return { sent: active.length };
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

  // Verifică token + Phone Number ID pentru WhatsApp Business Cloud API (spec „mod automat").
  handle(IPC.settings.testWhatsapp, null, async () => {
    const result = await messaging.whatsappProvider().verify();
    if (!result.ok) {
      throw new UserFacingError(
        result.error ?? 'Conexiunea cu WhatsApp Business Cloud API a eșuat.',
      );
    }
    return {
      ok: true,
      displayPhoneNumber: result.displayPhoneNumber ?? null,
      verifiedName: result.verifiedName ?? null,
    };
  });

  // Mapare template local WhatsApp → template aprobat de Meta (fallback după 24h).
  handle(IPC.settings.whatsappTemplateMap.list, null, () => ctx.messages.listWhatsappTemplateMaps());

  handle(IPC.settings.whatsappTemplateMap.upsert, whatsappTemplateMapUpsertSchema, (data) =>
    ctx.messages.upsertWhatsappTemplateMap(data),
  );

  handle(IPC.settings.whatsappTemplateMap.delete, whatsappTemplateMapDeleteSchema, ({ id }) => {
    ctx.messages.deleteWhatsappTemplateMap(id);
    return { deleted: true };
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
