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

// Main-process modules import 'electron'; îl înlocuim cu un mock minimal.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  Notification: class {
    static isSupported() {
      return false;
    }
    on() {}
    show() {}
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import { createTestDb, seedBasics } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { AppContext } from '../../src/main/app-context';
import { SchedulerService } from '../../src/main/services/scheduler.service';
import { NotificationService } from '../../src/main/services/notification.service';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import { SmtpEmailProvider } from '../../src/main/services/messaging/email.provider';
import { SecretsService } from '../../src/main/services/secrets.service';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { defaultReminderRules } from '../../src/shared/schemas/reminder';
import type { AppPaths } from '../../src/main/paths';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as never;

function makeCtx(db: Db, now: () => Date): AppContext {
  const paths: AppPaths = { dataDir: '', backupsDir: '', logsDir: '', dbFile: '' };
  return new AppContext(db, paths, silentLogger, () => null, now);
}

describe('SchedulerService — remindere scadente și restante', () => {
  let db: Db;
  let cleanup: () => void;
  let ids: { associationId: number; contactId: number; serviceId: number };

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    ids = seedBasics(db);
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  function setup(nowIso: string) {
    const ctx = makeCtx(db, () => new Date(nowIso));
    const notifications = new NotificationService(ctx);
    const showSpy = vi.spyOn(notifications, 'show').mockImplementation(() => {});
    const messaging = new MessagingService(ctx, new SecretsService(ctx));
    const scheduler = new SchedulerService(ctx, notifications, messaging);
    return { ctx, scheduler, showSpy };
  }

  const intervention = (performedDate: string, today: string) =>
    saveIntervention(
      db,
      {
        association_id: ids.associationId,
        service_id: ids.serviceId,
        performed_date: performedDate,
        interval_months: 3,
        notes: null,
        completes_followup_id: null,
      },
      defaultReminderRules,
      today,
    );

  it('procesează reminderul intern scadent și îl marchează sent', async () => {
    // Intervenție pe 13.08 → due 13.11; reminderul de 30 zile e scadent pe 14.10.
    intervention('2026-08-13', '2026-08-13');
    const { scheduler, showSpy } = setup('2026-10-14T10:00:00');

    await scheduler.tick(false);

    const r30 = db.get<{ status: string }>(
      `SELECT status FROM reminders WHERE offset_days = 30`,
    );
    expect(r30!.status).toBe('sent');
    expect(showSpy).toHaveBeenCalledTimes(1);
    // Cele de 14 și 3 zile rămân pending (nu sunt încă scadente).
    const pending = db.all(`SELECT * FROM reminders WHERE status = 'pending'`);
    expect(pending).toHaveLength(2);
  });

  it('nu procesează același reminder de două ori', async () => {
    intervention('2026-08-13', '2026-08-13');
    const { scheduler, showSpy } = setup('2026-10-14T10:00:00');
    await scheduler.tick(false);
    await scheduler.tick(false);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  it('gardă de reintrare: tick-uri suprapuse nu procesează dublu (spec #3)', async () => {
    intervention('2026-08-13', '2026-08-13');
    const { scheduler, showSpy } = setup('2026-10-14T10:00:00');

    // Pornim al doilea tick înainte ca primul să se termine — fără gardă, ambele
    // ar vedea reminderul încă 'pending' și l-ar procesa de două ori.
    const p1 = scheduler.tick(false);
    const p2 = scheduler.tick(false);
    await Promise.all([p1, p2]);

    const r30 = db.get<{ status: string }>(`SELECT status FROM reminders WHERE offset_days = 30`);
    expect(r30!.status).toBe('sent');
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  it('claimForProcessing reclamă un reminder pending o singură dată (spec #3)', () => {
    intervention('2026-08-13', '2026-08-13');
    const row = db.get<{ id: number }>(`SELECT id FROM reminders WHERE offset_days = 30`);
    const { ctx } = setup('2026-10-14T10:00:00');

    expect(ctx.reminders.claimForProcessing(row!.id)).toBe(true);
    const claimed = db.get<{ status: string }>(`SELECT status FROM reminders WHERE id = ?`, row!.id);
    expect(claimed!.status).toBe('processing');

    // Un al doilea claim pe același rând eșuează — nu mai e 'pending'.
    expect(ctx.reminders.claimForProcessing(row!.id)).toBe(false);
  });

  it('la pornire: reminderele blocate pe processing dintr-o cădere anterioară devin failed (spec #4)', () => {
    intervention('2026-08-13', '2026-08-13');
    const row = db.get<{ id: number }>(`SELECT id FROM reminders WHERE offset_days = 30`);
    db.run(`UPDATE reminders SET status = 'processing' WHERE id = ?`, row!.id);

    // 'now' devreme, ca niciun reminder să nu fie și scadent — izolăm sweep-ul de tick.
    const { scheduler } = setup('2026-08-13T10:00:00');
    scheduler.start();
    scheduler.stop();

    const swept = db.get<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM reminders WHERE id = ?`,
      row!.id,
    );
    expect(swept!.status).toBe('failed');
    expect(swept!.error_message).toContain('Întrerupt de închiderea aplicației');
  });

  it('WhatsApp automat fără token/Phone Number ID configurate: NU marchează sent, ajunge failed după 3 încercări (spec #1)', async () => {
    intervention('2026-08-13', '2026-08-13');
    const { ctx, scheduler } = setup('2026-10-14T10:00:00');
    // Modul „Automat” e activ, dar fără token/phone_number_id salvate — exact
    // scenariul de DRY-RUN tăcut din review; acum trebuie tratat ca eșec real.
    const settings = ctx.settings.get();
    ctx.settings.save({ ...settings, whatsapp: { ...settings.whatsapp, mode: 'cloud_api' } });

    await scheduler.tick(false); // încercarea 1 → pending, cu eroare explicită
    let r = db.get<{ status: string; error_message: string | null }>(
      `SELECT status, error_message FROM reminders WHERE offset_days = 30`,
    );
    expect(r!.status).toBe('pending');
    expect(r!.error_message).toMatch(/configurat incomplet/i);

    await scheduler.tick(false); // încercarea 2
    await scheduler.tick(false); // încercarea 3 → failed
    r = db.get(`SELECT status, error_message FROM reminders WHERE offset_days = 30`);
    expect(r!.status).toBe('failed');

    const log = db.get<{ status: string }>(`SELECT status FROM message_logs WHERE channel = 'whatsapp'`);
    expect(log!.status).toBe('failed');
  });

  it('la pornire după pauză lungă: digest pentru restante, nu avalanșă', async () => {
    intervention('2026-08-13', '2026-08-13');
    // Pornim aplicația pe 12.11 — reminderele de 30 și 14 zile sunt restante,
    // cel de 3 zile (10.11) tot restant; toate trebuie procesate.
    const { scheduler, showSpy } = setup('2026-11-12T09:30:00');

    await scheduler.tick(true);

    const statuses = db.all<{ status: string }>(`SELECT status FROM reminders`);
    expect(statuses.every((r) => r.status === 'sent')).toBe(true);
    // Un singur digest, fără notificări individuale pentru restante.
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(showSpy.mock.calls[0][1]).toContain('restante');
  });

  it('asociație inactivă → reminder skipped, fără notificare (spec #9)', async () => {
    intervention('2026-08-13', '2026-08-13');
    db.run(`UPDATE associations SET active = 0 WHERE id = ?`, ids.associationId);
    const { scheduler, showSpy } = setup('2026-10-14T10:00:00');

    await scheduler.tick(false);

    const r30 = db.get<{ status: string }>(`SELECT status FROM reminders WHERE offset_days = 30`);
    expect(r30!.status).toBe('skipped');
    expect(showSpy).not.toHaveBeenCalled();
  });

  it('do_not_contact → canalul whatsapp devine skipped cu notificare internă (spec #43)', async () => {
    intervention('2026-08-13', '2026-08-13');
    db.run(`UPDATE contacts SET do_not_contact = 1 WHERE id = ?`, ids.contactId);
    const { scheduler, showSpy } = setup('2026-10-14T10:00:00');

    await scheduler.tick(false);

    const r30 = db.get<{ status: string }>(`SELECT status FROM reminders WHERE offset_days = 30`);
    expect(r30!.status).toBe('skipped');
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(showSpy.mock.calls[0][1]).toContain('Nu contacta');
  });

  it('follow-up anulat → reminderele lui devin cancelled la procesare', async () => {
    const result = intervention('2026-08-13', '2026-08-13');
    db.run(`UPDATE followups SET status = 'cancelled' WHERE id = ?`, result.followup.id);
    const { scheduler } = setup('2026-10-14T10:00:00');

    await scheduler.tick(false);

    const r30 = db.get<{ status: string }>(`SELECT status FROM reminders WHERE offset_days = 30`);
    expect(r30!.status).toBe('cancelled');
  });

  it('REGRESIE P0: emailul automat păstrează corpul complet pentru retrimitere', async () => {
    intervention('2026-08-13', '2026-08-13');
    db.run("UPDATE reminders SET channel = 'email' WHERE offset_days = 30");
    const { scheduler } = setup('2026-10-14T10:00:00');
    const mesaj = `${'Detalii complete despre programare. '.repeat(30)}Semnătura firmei.`;
    db.run("UPDATE message_templates SET body = ? WHERE channel = 'email'", mesaj);
    const trimite = vi.spyOn(SmtpEmailProvider.prototype, 'send').mockResolvedValue({ ok: false, error: 'Eroare SMTP simulată' });
    await scheduler.tick(false);
    expect(trimite).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: mesaj }));
    expect(db.get("SELECT message_preview FROM message_logs WHERE channel = 'email'")).toEqual({ message_preview: mesaj });
  });

  it.each(['dezactivate', 'șterse', 'doar spații'] as const)('REGRESIE P1: șabloane email %s nu trimit un corp gol și ajung la failed după trei încercări', async (caz) => {
    intervention('2026-08-13', '2026-08-13');
    db.run("UPDATE reminders SET channel = 'email' WHERE offset_days = 30");
    const { ctx, scheduler } = setup('2026-10-14T10:00:00');
    const setari = ctx.settings.get();
    ctx.settings.save({ ...setari, smtp: { ...setari.smtp, host: 'smtp.invalid' } });
    if (caz === 'dezactivate') db.run("UPDATE message_templates SET active = 0 WHERE channel = 'email'");
    if (caz === 'șterse') db.run("DELETE FROM message_templates WHERE channel = 'email'");
    if (caz === 'doar spații') db.run("UPDATE message_templates SET body = '   ' WHERE channel = 'email'");
    const trimite = vi.spyOn(SmtpEmailProvider.prototype, 'send').mockResolvedValue({ ok: true });
    const eroare = caz === 'doar spații' ? 'produce un mesaj gol' : 'niciun șablon activ pe canalul email';
    for (let incercare = 1; incercare <= 3; incercare++) {
      await scheduler.tick(false);
      expect(trimite).not.toHaveBeenCalled();
      expect(db.get("SELECT status, attempt_count, error_message FROM reminders WHERE channel = 'email'"))
        .toEqual({ status: incercare === 3 ? 'failed' : 'pending', attempt_count: incercare, error_message: expect.stringContaining(eroare) });
    }
    expect(db.get('SELECT COUNT(*) AS n FROM message_logs')).toEqual({ n: 0 });
  });

  it('REGRESIE P1: activarea unui șablon înainte de retry permite numai emailul cu conținut', async () => {
    intervention('2026-08-13', '2026-08-13');
    db.run("UPDATE reminders SET channel = 'email' WHERE offset_days = 30");
    db.run("UPDATE message_templates SET active = 0 WHERE channel = 'email'");
    const { scheduler } = setup('2026-10-14T10:00:00');
    const trimite = vi.spyOn(SmtpEmailProvider.prototype, 'send').mockResolvedValue({ ok: true });
    await scheduler.tick(false);
    expect(trimite).not.toHaveBeenCalled();
    db.run("UPDATE message_templates SET active = 1, body = 'Bună ziua, programăm intervenția.' WHERE channel = 'email'");
    await scheduler.tick(false);
    expect(trimite).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: 'Bună ziua, programăm intervenția.' }));
    expect(db.get("SELECT status, attempt_count FROM reminders WHERE channel = 'email'"))
      .toEqual({ status: 'sent', attempt_count: 2 });
  });

  it('email eșuat: retry până la limita de 3, apoi failed (spec #42)', async () => {
    // Regulă doar email ca să exersăm calea de eșec (SMTP neconfigurat → eroare).
    saveIntervention(
      db,
      {
        association_id: ids.associationId,
        service_id: ids.serviceId,
        performed_date: '2026-08-13',
        interval_months: 3,
        notes: null,
        completes_followup_id: null,
      },
      [{ offset_days: 30, channel: 'email', active: true }],
      '2026-08-13',
    );
    const { scheduler } = setup('2026-10-14T10:00:00');

    await scheduler.tick(false); // încercarea 1 → pending
    let r = db.get<{ status: string; attempt_count: number }>(`SELECT status, attempt_count FROM reminders`);
    expect(r!.status).toBe('pending');
    expect(r!.attempt_count).toBe(1);

    await scheduler.tick(false); // încercarea 2 → pending
    await scheduler.tick(false); // încercarea 3 → failed
    r = db.get(`SELECT status, attempt_count FROM reminders`);
    expect(r!.status).toBe('failed');
    expect(r!.attempt_count).toBe(3);

    // Nu se mai reîncearcă automat.
    await scheduler.tick(false);
    r = db.get(`SELECT status, attempt_count FROM reminders`);
    expect(r!.attempt_count).toBe(3);
  });
});
