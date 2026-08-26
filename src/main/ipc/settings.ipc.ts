/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { dialog } from 'electron';
import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  settingsSchema,
  setSecretSchema,
  whatsappTemplateMapUpsertSchema,
  whatsappTemplateMapDeleteSchema,
  reportIds,
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

  // Trimite ACUM un raport anume, pentru verificare din Setări (butonul „Trimite acum, de probă”).
  const sendDigestNowSchema = z.object({ report: z.enum(reportIds) });
  handle(IPC.settings.sendDigestNow, sendDigestNowSchema, async ({ report: id }) => {
    const settings = ctx.settings.get();
    const report = settings.daily_digest.reports[id];

    if (!report.channels.email && !report.channels.whatsapp && !report.channels.notification) {
      throw new UserFacingError('Activează cel puțin un canal de trimitere pentru acest raport.');
    }
    if (report.channels.email) {
      const active = report.recipients.filter((r) => r.active && r.email);
      if (active.length === 0) {
        throw new UserFacingError('Adaugă mai întâi cel puțin un email activ pentru acest raport.');
      }
      if (!settings.smtp.host) {
        throw new UserFacingError('Configurează mai întâi emailul (Setări → Email).');
      }
    }
    if (report.channels.whatsapp) {
      if (!settings.daily_digest.owner_whatsapp_phone.trim()) {
        throw new UserFacingError('Completează mai întâi numărul tău de WhatsApp (mai jos).');
      }
      if (settings.whatsapp.mode === 'disabled') {
        throw new UserFacingError('WhatsApp e dezactivat (Setări → WhatsApp).');
      }
    }

    const result = await digest.sendNow(id);
    if (!result.sent && !result.empty) {
      const detail = result.failures.map((f) => f.error).filter(Boolean).join('; ');
      throw new UserFacingError(
        detail ? `Trimiterea a eșuat: ${detail}` : 'Trimiterea a eșuat pe toate canalele activate.',
      );
    }
    return result;
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
