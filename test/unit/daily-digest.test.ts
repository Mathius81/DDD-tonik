/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const notificationMock = vi.hoisted(() => {
  const instances: Array<{ title: string; body: string; clickHandler?: () => void }> = [];
  class Notification {
    static isSupported() {
      return true;
    }
    private record: { title: string; body: string; clickHandler?: () => void };
    constructor(opts: { title: string; body: string }) {
      this.record = { title: opts.title, body: opts.body };
      instances.push(this.record);
    }
    on(event: string, cb: () => void) {
      if (event === 'click') this.record.clickHandler = cb;
    }
    show() {}
  }
  return { instances, Notification };
});

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  Notification: notificationMock.Notification,
}));

import { shell } from 'electron';
import { createTestDb, seedBasics } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { AppContext } from '../../src/main/app-context';
import { MessageRepository } from '../../src/main/db/repos/messages.repo';
import { DailyDigestService } from '../../src/main/services/daily-digest.service';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import { NotificationService } from '../../src/main/services/notification.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { buildReportContent } from '../../src/main/services/reports/report-builder';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { defaultReminderRules } from '../../src/shared/schemas/reminder';
import type { AppPaths } from '../../src/main/paths';
import type { SendResult } from '../../src/main/services/messaging/email.provider';
import type { SmtpEmailProvider } from '../../src/main/services/messaging/email.provider';
import type { Settings } from '../../src/shared/schemas/settings';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as never;

/** `messaging.emailProvider()` întoarce clasa concretă `SmtpEmailProvider` (câmpuri private,
 * deci tipare nominală) — construim un dublu de test cu aceeași formă și îl „deghizăm" prin cast.
 * `send` e păstrat separat, netipat ca `SmtpEmailProvider`, pentru a putea fi folosit direct
 * cu matcher-ii `toHaveBeenCalled*` ai vitest. */
function fakeEmailProvider(result: SendResult = { ok: true }) {
  const send = vi.fn().mockResolvedValue(result);
  const verify = vi.fn().mockResolvedValue(undefined);
  const provider = { send, verify } as unknown as SmtpEmailProvider;
  return { provider, send };
}

describe('DailyDigestService', () => {
  let db: Db;
  let cleanup: () => void;
  let ids: { associationId: number; contactId: number; serviceId: number };

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    ids = seedBasics(db);
    notificationMock.instances.length = 0;
    vi.mocked(shell.openExternal).mockClear();
  });

  afterEach(() => cleanup());

  function makeDigest(nowIso: string) {
    const paths: AppPaths = { dataDir: '', backupsDir: '', logsDir: '', dbFile: '' };
    const ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date(nowIso));
    const messaging = new MessagingService(ctx, new SecretsService(ctx));
    const notifications = new NotificationService(ctx);
    const digest = new DailyDigestService(ctx, messaging, notifications);
    return { ctx, messaging, notifications, digest };
  }

  /** Salvează peste setările implicite doar câmpurile date, păstrând restul (evită resetul reports/legacy_migrated). */
  function patchSettings(ctx: ReturnType<typeof makeDigest>['ctx'], patch: Partial<Settings>): Settings {
    const current = ctx.settings.get();
    const next = { ...current, ...patch };
    ctx.settings.save(next);
    return ctx.settings.get();
  }

  describe('conținutul rapoartelor', () => {
    it('DDD dimineața include programările de azi, restanțele și scadențele apropiate', () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-03-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-03-01',
      );
      const { ctx } = makeDigest('2026-08-14T08:05:00');
      const content = buildReportContent(ctx, 'ddd_dimineata');

      expect(content.body).toContain('Planul zilei');
      expect(content.body).toContain('RESTANTE (1)');
      expect(content.body).toContain('Asociația Bloc A7');
      expect(content.body).toContain('Dezinsecție');
      expect(content.body).toContain('Ion Popescu');
      expect(content.body).toContain('restant de');
      expect(content.isEmpty).toBe(false);
    });

    it('DDD dimineața, zi liberă → mesajul „totul este la zi” (raport gol, dar isEmpty rămâne semnalat)', () => {
      const { ctx } = makeDigest('2026-08-14T08:05:00');
      const content = buildReportContent(ctx, 'ddd_dimineata');
      expect(content.body).toContain('Nimic urgent astăzi');
      expect(content.isEmpty).toBe(true);
    });

    it('DDD seara se uită la ziua următoare, nu la azi', () => {
      db.run(
        `INSERT INTO followups (association_id, service_id, due_date, status, scheduled_date)
         VALUES (?, ?, '2026-08-20', 'scheduled', '2026-08-14')`,
        ids.associationId,
        ids.serviceId,
      );
      db.run(
        `INSERT INTO followups (association_id, service_id, due_date, status, scheduled_date)
         VALUES (?, ?, '2026-08-20', 'scheduled', '2026-08-15')`,
        ids.associationId,
        ids.serviceId,
      );

      const { ctx } = makeDigest('2026-08-14T20:00:00');
      const morning = buildReportContent(ctx, 'ddd_dimineata');
      const evening = buildReportContent(ctx, 'ddd_seara');

      // Dimineața (ancoră 14.08) vede programarea din 14.08, nu pe cea din 15.08.
      expect(morning.body).toContain('PROGRAMATE ASTĂZI (1)');
      // Seara (ancoră 15.08 — mâine) vede programarea din 15.08, nu pe cea din 14.08.
      expect(evening.body).toContain('PROGRAMATE MÂINE (1)');
      expect(evening.subject).toContain('15.08.2026');
    });

    it('Covoare și Cauciucuri au conținut separat, fiecare cu propriul subiect', () => {
      const { ctx } = makeDigest('2026-08-14T08:00:00');
      const covoare = buildReportContent(ctx, 'covoare_dimineata');
      const cauciucuri = buildReportContent(ctx, 'cauciucuri_dimineata');
      expect(covoare.subject).toContain('Covoare');
      expect(cauciucuri.subject).toContain('Cauciucuri');
      expect(covoare.route).toBe('/covoare');
      expect(cauciucuri.route).toBe('/cauciucuri');
    });
  });

  describe('compatibilitate cu setările vechi', () => {
    it('un raport vechi (un singur email, doar dimineața) migrează transparent în ddd_dimineata', () => {
      // Simulăm o bază reală, salvată cu versiunea VECHE a aplicației: `daily_digest`
      // n-are deloc `reports`/`legacy_migrated`/`owner_whatsapp_phone`.
      db.run(
        `INSERT INTO settings (key, value) VALUES ('app_settings', ?)`,
        JSON.stringify({
          smtp: {
            host: 'smtp.test',
            port: 587,
            secure: false,
            username: '',
            has_password: false,
            from_name: '',
            from_email: '',
          },
          daily_digest: {
            enabled: true,
            email: '',
            recipients: [
              { email: 'sef@tonik.ro', active: true },
              { email: 'oprit@tonik.ro', active: false },
            ],
            send_at: '07:45',
          },
        }),
      );

      const paths: AppPaths = { dataDir: '', backupsDir: '', logsDir: '', dbFile: '' };
      const ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date('2026-08-14T08:00:00'));
      const settings = ctx.settings.get();

      expect(settings.daily_digest.legacy_migrated).toBe(true);
      expect(settings.daily_digest.reports.ddd_dimineata).toEqual({
        enabled: true,
        send_at: '07:45',
        channels: { email: true, whatsapp: false, notification: false },
        recipients: [
          { email: 'sef@tonik.ro', active: true },
          { email: 'oprit@tonik.ro', active: false },
        ],
      });
      // Celelalte 5 rapoarte rămân la valorile implicite (dezactivate).
      expect(settings.daily_digest.reports.ddd_seara.enabled).toBe(false);
      expect(settings.daily_digest.reports.covoare_dimineata.enabled).toBe(false);
    });

    it('raportul migrat ddd_dimineata trimite efectiv, fără nicio reconfigurare din partea utilizatorului', async () => {
      db.run(
        `INSERT INTO settings (key, value) VALUES ('app_settings', ?)`,
        JSON.stringify({
          smtp: {
            host: 'smtp.test',
            port: 587,
            secure: false,
            username: '',
            has_password: false,
            from_name: '',
            from_email: '',
          },
          daily_digest: {
            enabled: true,
            email: '',
            recipients: [{ email: 'sef@tonik.ro', active: true }],
            send_at: '07:45',
          },
        }),
      );

      const { ctx, messaging, digest } = makeDigest('2026-08-14T08:00:00');
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      await digest.tick();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        to: 'sef@tonik.ro',
      });
    });

    it('nu retrimite ddd_dimineata în ziua actualizării, dacă vechea cheie arăta deja „trimis azi”', async () => {
      db.run(
        `INSERT INTO settings (key, value) VALUES ('app_settings', ?)`,
        JSON.stringify({
          smtp: { host: 'smtp.test', port: 587, secure: false, username: '', has_password: false, from_name: '', from_email: '' },
          daily_digest: {
            enabled: true,
            email: '',
            recipients: [{ email: 'sef@tonik.ro', active: true }],
            send_at: '07:45',
          },
        }),
      );
      // Cheia veche globală arată că azi (14.08) s-a trimis deja, sub sistemul vechi.
      db.run(
        `INSERT INTO settings (key, value) VALUES ('last_daily_digest_date', '2026-08-14')`,
      );

      const { messaging, digest } = makeDigest('2026-08-14T09:00:00');
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      await digest.tick();

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('tick: independență între rapoarte', () => {
    it('nu trimite înainte de ora setată și nu trimite de două ori pe zi', async () => {
      const { ctx, messaging } = makeDigest('2026-08-14T07:30:00');
      patchSettings(ctx, {
        smtp: { ...ctx.settings.get().smtp, host: 'smtp.test' },
        daily_digest: {
          ...ctx.settings.get().daily_digest,
          reports: {
            ...ctx.settings.get().daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: true, whatsapp: false, notification: false },
              recipients: [
                { email: 'sef@tonik.ro', active: true },
                { email: 'oprit@tonik.ro', active: false },
              ],
            },
          },
        },
      });
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);
      const notifications = new NotificationService(ctx);
      const digest = new DailyDigestService(ctx, messaging, notifications);

      await digest.tick(); // 07:30 — înainte de oră
      expect(send).not.toHaveBeenCalled();

      const later = makeDigest('2026-08-14T08:10:00');
      const { provider: laterProvider, send: laterSend } = fakeEmailProvider();
      vi.spyOn(later.messaging, 'emailProvider').mockReturnValue(laterProvider);
      await later.digest.tick(); // 08:10 — trimite doar către destinatarul activ
      expect(laterSend).toHaveBeenCalledTimes(1);
      expect(laterSend.mock.calls[0][0]).toMatchObject({
        to: 'sef@tonik.ro',
      });

      await later.digest.tick(); // același apel în aceeași zi — nu retrimite
      expect(laterSend).toHaveBeenCalledTimes(1);
    });

    it('dezactivat → nu trimite', async () => {
      const { ctx, messaging, digest } = makeDigest('2026-08-14T09:00:00');
      patchSettings(ctx, {
        smtp: { ...ctx.settings.get().smtp, host: 'smtp.test' },
      });
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);
      await digest.tick();
      expect(send).not.toHaveBeenCalled();
    });

    it('dimineața și seara sunt independente: trimiterea uneia nu o blochează sau declanșează pe cealaltă', async () => {
      // Raportul de seară are nevoie de ceva programat mâine, altfel e gol și nu se trimite
      // (regulă separată, testată explicit mai jos) — aici testăm STRICT independența orelor.
      db.run(
        `INSERT INTO followups (association_id, service_id, due_date, status, scheduled_date)
         VALUES (?, ?, '2026-08-20', 'scheduled', '2026-08-15')`,
        ids.associationId,
        ids.serviceId,
      );

      const { ctx, messaging, digest } = makeDigest('2026-08-14T20:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        smtp: { ...settings.smtp, host: 'smtp.test' },
        daily_digest: {
          ...settings.daily_digest,
          reports: {
            ...settings.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: true, whatsapp: false, notification: false },
              recipients: [{ email: 'dimineata@tonik.ro', active: true }],
            },
            ddd_seara: {
              enabled: true,
              send_at: '18:00',
              channels: { email: true, whatsapp: false, notification: false },
              recipients: [{ email: 'seara@tonik.ro', active: true }],
            },
          },
        },
      });
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      await digest.tick();

      const calls = send.mock.calls.map((c) => c[0].to);
      expect(calls).toContain('dimineata@tonik.ro');
      expect(calls).toContain('seara@tonik.ro');
      expect(calls).toHaveLength(2);

      // A doua rulare din aceeași zi nu retrimite pe niciunul dintre cele două.
      await digest.tick();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it('rapoartele pe spații de lucru diferite nu se blochează reciproc', async () => {
      const { ctx, messaging, digest } = makeDigest('2026-08-14T09:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        smtp: { ...settings.smtp, host: 'smtp.test' },
        daily_digest: {
          ...settings.daily_digest,
          reports: {
            ...settings.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: true, whatsapp: false, notification: false },
              recipients: [{ email: 'ddd@tonik.ro', active: true }],
            },
            covoare_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: false, whatsapp: false, notification: true },
              recipients: [],
            },
            cauciucuri_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: false, whatsapp: false, notification: true },
              recipients: [],
            },
          },
        },
      });
      // Emailul DDD eșuează — Covoare/Cauciucuri (notificare) tot trebuie să treacă.
      const { provider, send } = fakeEmailProvider({ ok: false, error: 'SMTP jos' });
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      await digest.tick();

      expect(send).toHaveBeenCalledTimes(1); // doar DDD folosește email
      // Covoare + Cauciucuri, ambele goale (fără date), NU trimit notificare (regula „gol → nu trimite”).
      expect(notificationMock.instances).toHaveLength(0);
    });
  });

  describe('canale de trimitere', () => {
    it('raport gol (fără date) → nu se trimite nimic, pe niciun canal', async () => {
      const { ctx, messaging, digest } = makeDigest('2026-08-14T08:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        daily_digest: {
          ...settings.daily_digest,
          reports: {
            ...settings.daily_digest.reports,
            covoare_seara: {
              enabled: true,
              send_at: '18:00',
              channels: { email: true, whatsapp: false, notification: true },
              recipients: [{ email: 'covoare@tonik.ro', active: true }],
            },
          },
        },
      });
      const { provider, send } = fakeEmailProvider();
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      const result = await digest.sendNow('covoare_seara');

      expect(result.empty).toBe(true);
      expect(result.sent).toBe(false);
      expect(send).not.toHaveBeenCalled();
      expect(notificationMock.instances).toHaveLength(0);
    });

    it('un canal eșuat (email) nu blochează celelalte (notificare) — ziua se marchează trimisă', async () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-03-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-03-01',
      );

      const { ctx, messaging, digest } = makeDigest('2026-08-14T08:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        daily_digest: {
          ...settings.daily_digest,
          reports: {
            ...settings.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: true, whatsapp: false, notification: true },
              recipients: [{ email: 'sef@tonik.ro', active: true }],
            },
          },
        },
      });
      const { provider, send } = fakeEmailProvider({ ok: false, error: 'SMTP jos' });
      vi.spyOn(messaging, 'emailProvider').mockReturnValue(provider);

      const result = await digest.sendNow('ddd_dimineata');

      expect(result.sent).toBe(true); // notificarea a reușit
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].channel).toBe('email');
      expect(notificationMock.instances).toHaveLength(1);
      expect(notificationMock.instances[0].title).toContain('Planul zilei');
    });

    it('WhatsApp mod asistat: NU deschide automat conversația — doar la click pe notificare', async () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-03-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-03-01',
      );

      const { ctx, digest } = makeDigest('2026-08-14T08:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        whatsapp: { ...settings.whatsapp, mode: 'assisted' },
        daily_digest: {
          ...settings.daily_digest,
          owner_whatsapp_phone: '0722111222',
          reports: {
            ...settings.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: false, whatsapp: true, notification: false },
              recipients: [],
            },
          },
        },
      });

      const result = await digest.sendNow('ddd_dimineata');

      expect(result.sent).toBe(true);
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(notificationMock.instances).toHaveLength(1);

      notificationMock.instances[0].clickHandler?.();
      expect(shell.openExternal).toHaveBeenCalledTimes(1);
      expect(vi.mocked(shell.openExternal).mock.calls[0][0]).toContain('wa.me/40722111222');
    });

    it('WhatsApp mod cloud_api: trimite automat, fără notificare', async () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-03-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-03-01',
      );

      const { ctx, messaging, digest } = makeDigest('2026-08-14T08:00:00');
      const settings = ctx.settings.get();
      patchSettings(ctx, {
        whatsapp: { ...settings.whatsapp, mode: 'cloud_api' },
        daily_digest: {
          ...settings.daily_digest,
          owner_whatsapp_phone: '0722111222',
          reports: {
            ...settings.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '08:00',
              channels: { email: false, whatsapp: true, notification: false },
              recipients: [],
            },
          },
        },
      });
      const sendSpy = vi
        .spyOn(messaging, 'sendWhatsappCloudApiAuto')
        .mockResolvedValue({ ok: true, wamid: 'wamid-test' });

      const result = await digest.sendNow('ddd_dimineata');

      expect(result.sent).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][1]).toBe('40722111222');
      expect(notificationMock.instances).toHaveLength(0);
    });
  });
});

describe('MessageRepository — createTemplate nu activează automat un șablon nou', () => {
  let db: Db;
  let cleanup: () => void;
  let messages: MessageRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    messages = new MessageRepository(db);
  });

  afterEach(() => cleanup());

  it('un șablon whatsapp nou creat este INACTIV, iar cel din seed rămâne activ', () => {
    // Seed-ul din migrația 001 creează șablonul WhatsApp implicit, activ.
    const seedActive = messages.getActiveTemplateForChannel('whatsapp');
    expect(seedActive?.name).toBe('Reminder standard WhatsApp');
    expect(seedActive?.active).toBe(true);

    const created = messages.createTemplate({
      name: 'Șablon de probă',
      channel: 'whatsapp',
      subject: null,
      body: 'Text de test, doar pentru încercare — nu trebuie trimis clienților reali.',
    });

    // Utilizatorul „încearcă” un șablon nou — coloana `active` are DEFAULT 1 în schemă,
    // deci fără insert explicit `active = 0`, șablonul de probă ar deveni tăcut activ.
    expect(created.active).toBe(false);

    // getActiveTemplateForChannel trebuie să întoarcă în continuare șablonul vechi din seed,
    // nu cel nou creat — altfel reminderele automate ar pleca cu textul de probă.
    const stillActive = messages.getActiveTemplateForChannel('whatsapp');
    expect(stillActive?.id).toBe(seedActive!.id);
    expect(stillActive?.name).toBe('Reminder standard WhatsApp');
  });

  it('un șablon email nou creat este INACTIV, iar cel din seed rămâne activ', () => {
    const seedActive = messages.getActiveTemplateForChannel('email');
    expect(seedActive?.name).toBe('Reminder standard Email');

    const created = messages.createTemplate({
      name: 'Șablon email de probă',
      channel: 'email',
      subject: 'Subiect de test',
      body: 'Text de test.',
    });

    expect(created.active).toBe(false);
    expect(messages.getActiveTemplateForChannel('email')?.id).toBe(seedActive!.id);
  });
});
