import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, seedBasics } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { generateRemindersForFollowup } from '../../src/main/domain/reminder-rules';
import { ReminderRepository } from '../../src/main/db/repos/reminders.repo';
import { runMigrations, currentSchemaVersion } from '../../src/main/db/migrations';
import { defaultReminderRules } from '../../src/shared/schemas/reminder';
import type { Followup } from '../../src/shared/schemas/followup';

const TODAY = '2026-08-13';

describe('saveIntervention — ciclul complet (spec #15, #60, #63)', () => {
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

  const input = () => ({
    association_id: ids.associationId,
    service_id: ids.serviceId,
    performed_date: TODAY,
    interval_months: 3,
    notes: null,
    completes_followup_id: null,
  });

  it('creează intervenția, follow-up-ul la +3 luni și reminderele', () => {
    const result = saveIntervention(db, input(), defaultReminderRules, TODAY);

    expect(result.followup.due_date).toBe('2026-11-13');
    expect(result.followup.status).toBe('pending');
    expect(result.remindersCreated).toBe(3);

    const reminders = db.all(
      'SELECT * FROM reminders WHERE followup_id = ? ORDER BY offset_days DESC',
      result.followup.id,
    );
    expect(reminders).toHaveLength(3);
    // 13.11.2026 - 30 zile = 14.10.2026
    expect(reminders[0]).toMatchObject({ offset_days: 30, channel: 'whatsapp', scheduled_at: '2026-10-14 09:00:00' });
    expect(reminders[1]).toMatchObject({ offset_days: 14, channel: 'whatsapp', scheduled_at: '2026-10-30 09:00:00' });
    expect(reminders[2]).toMatchObject({ offset_days: 3, channel: 'internal', scheduled_at: '2026-11-10 09:00:00' });
  });

  it('a doua intervenție închide follow-up-ul anterior și îi anulează reminderele', () => {
    const first = saveIntervention(db, input(), defaultReminderRules, TODAY);
    const second = saveIntervention(
      db,
      { ...input(), performed_date: '2026-11-17' },
      defaultReminderRules,
      '2026-11-17',
    );

    const prevFollowup = db.get<{ status: string }>(
      'SELECT status FROM followups WHERE id = ?',
      first.followup.id,
    );
    expect(prevFollowup!.status).toBe('completed');

    const prevReminders = db.all<{ status: string }>(
      'SELECT status FROM reminders WHERE followup_id = ?',
      first.followup.id,
    );
    expect(prevReminders.every((r) => r.status === 'cancelled')).toBe(true);

    expect(second.followup.due_date).toBe('2027-02-17');
    expect(second.followup.status).toBe('pending');
  });

  it('nu generează remindere duplicate la rulare repetată a regulilor', () => {
    const result = saveIntervention(db, input(), defaultReminderRules, TODAY);
    const repo = new ReminderRepository(db);
    const followup = db.get<Followup>('SELECT * FROM followups WHERE id = ?', result.followup.id)!;

    const createdAgain = generateRemindersForFollowup(repo, followup, defaultReminderRules, TODAY);
    expect(createdAgain).toBe(0);
    const count = db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM reminders WHERE followup_id = ?',
      result.followup.id,
    );
    expect(count!.n).toBe(3);
  });

  it('reminderele din trecut se programează azi, nu se pierd', () => {
    // Intervenție retroactivă: due_date peste 1 lună, reminderul de 30 de zile ar fi fost ieri.
    const result = saveIntervention(
      db,
      { ...input(), performed_date: '2026-07-14', interval_months: 1 },
      defaultReminderRules,
      TODAY,
    );
    expect(result.followup.due_date).toBe('2026-08-14');
    const r30 = db.get<{ scheduled_at: string }>(
      'SELECT scheduled_at FROM reminders WHERE followup_id = ? AND offset_days = 30',
      result.followup.id,
    );
    expect(r30!.scheduled_at).toBe(`${TODAY} 09:00:00`);
  });

  it('face ROLLBACK complet dacă un pas eșuează', () => {
    // Forțăm eșec: serviciu inexistent încalcă FK la inserarea follow-up-ului.
    expect(() =>
      saveIntervention(db, { ...input(), service_id: 9999 }, defaultReminderRules, TODAY),
    ).toThrow();

    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM interventions')!.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM followups')!.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM reminders')!.n).toBe(0);
  });

  it('regulile inactive nu generează remindere', () => {
    const rules = [
      { offset_days: 30, channel: 'whatsapp' as const, active: true },
      { offset_days: 14, channel: 'whatsapp' as const, active: false },
    ];
    const result = saveIntervention(db, input(), rules, TODAY);
    expect(result.remindersCreated).toBe(1);
  });
});

describe('migrations', () => {
  it('sunt idempotente — a doua rulare nu aplică nimic', () => {
    const t = createTestDb();
    try {
      expect(currentSchemaVersion(t.db)).toBe(1);
      expect(runMigrations(t.db)).toEqual([]);
    } finally {
      t.cleanup();
    }
  });

  it('activează foreign keys', () => {
    const t = createTestDb();
    try {
      expect(() =>
        t.db.run(`INSERT INTO contacts (association_id, name) VALUES (99999, 'X')`),
      ).toThrow();
    } finally {
      t.cleanup();
    }
  });
});
