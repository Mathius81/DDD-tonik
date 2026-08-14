import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import { createTestDb, seedBasics } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { AppContext } from '../../src/main/app-context';
import { DailyDigestService } from '../../src/main/services/daily-digest.service';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { defaultReminderRules } from '../../src/shared/schemas/reminder';
import type { AppPaths } from '../../src/main/paths';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as never;

describe('DailyDigestService', () => {
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

  function makeDigest(nowIso: string) {
    const paths: AppPaths = { dataDir: '', backupsDir: '', logsDir: '', dbFile: '' };
    const ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date(nowIso));
    const messaging = new MessagingService(ctx, new SecretsService(ctx.settings));
    return { ctx, digest: new DailyDigestService(ctx, messaging) };
  }

  it('conținutul include programările de azi, restanțele și scadențele apropiate', () => {
    // Intervenție veche → follow-up restant.
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
    const { digest } = makeDigest('2026-08-14T08:05:00');
    const body = digest.buildBody('2026-08-14');

    expect(body).toContain('Planul zilei');
    expect(body).toContain('RESTANTE (1)');
    expect(body).toContain('Asociația Bloc A7');
    expect(body).toContain('Dezinsecție');
    expect(body).toContain('Ion Popescu');
    expect(body).toContain('restant de');
  });

  it('zi liberă → mesajul „totul este la zi”', () => {
    const { digest } = makeDigest('2026-08-14T08:05:00');
    const body = digest.buildBody('2026-08-14');
    expect(body).toContain('Nimic urgent astăzi');
  });

  it('tick: nu trimite înainte de ora setată și nu trimite de două ori pe zi', async () => {
    const sent: string[] = [];
    const { ctx, digest } = makeDigest('2026-08-14T07:30:00');
    ctx.settings.save({
      ...ctx.settings.get(),
      smtp: { ...ctx.settings.get().smtp, host: 'smtp.test' },
      daily_digest: { enabled: true, email: 'sef@tonik.ro', send_at: '08:00' },
    });
    vi.spyOn(digest, 'send').mockImplementation(async (to) => {
      sent.push(to);
    });

    await digest.tick(); // 07:30 — înainte de oră
    expect(sent).toHaveLength(0);

    const later = makeDigest('2026-08-14T08:10:00');
    vi.spyOn(later.digest, 'send').mockImplementation(async (to) => {
      sent.push(to);
    });
    await later.digest.tick(); // 08:10 — trimite
    expect(sent).toEqual(['sef@tonik.ro']);

    await later.digest.tick(); // același apel în aceeași zi — nu retrimite
    expect(sent).toHaveLength(1);
  });

  it('tick: dezactivat sau fără email → nu trimite', async () => {
    const { ctx, digest } = makeDigest('2026-08-14T09:00:00');
    const spy = vi.spyOn(digest, 'send');
    ctx.settings.save({
      ...ctx.settings.get(),
      smtp: { ...ctx.settings.get().smtp, host: 'smtp.test' },
      daily_digest: { enabled: false, email: 'sef@tonik.ro', send_at: '08:00' },
    });
    await digest.tick();
    expect(spy).not.toHaveBeenCalled();
  });
});
