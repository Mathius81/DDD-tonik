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

  afterEach(() => cleanup());

  function setup(nowIso: string) {
    const ctx = makeCtx(db, () => new Date(nowIso));
    const notifications = new NotificationService(ctx);
    const showSpy = vi.spyOn(notifications, 'show').mockImplementation(() => {});
    const messaging = new MessagingService(ctx, new SecretsService(ctx.settings));
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
