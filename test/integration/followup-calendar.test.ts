/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creeazaContextTest } from '../helpers/app-context';
import { seedBasics } from '../helpers/tmp-db';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { generateRemindersForFollowup } from '../../src/main/domain/reminder-rules';
import { buildDddReport } from '../../src/main/services/reports/ddd-report';

describe('Calendar real — intervenție, scadență persistată, reminder și raport', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  beforeEach(() => {
    vi.stubEnv('TZ', 'Europe/Bucharest');
    baza = creeazaContextTest();
  });
  afterEach(() => {
    try { baza.cleanup(); } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28', '2026-02-25'],
    ['2028-01-31', 1, '2028-02-29', '2028-02-26'],
    ['2028-02-29', 12, '2029-02-28', '2029-02-25'],
    ['2026-12-31', 3, '2027-03-31', '2027-03-28'],
  ])('%s + %i luni persistă %s și reminderul cu 3 zile înainte, nu o aproximare cu 30 de zile/lună', (efectuata, luni, scadenta, reamintire) => {
    const { ctx } = baza;
    const { associationId, serviceId } = seedBasics(ctx.db);
    const rezultat = saveIntervention(ctx.db, {
      association_id: associationId, service_id: serviceId, performed_date: efectuata,
      interval_months: luni, notes: 'Calendar: ăâîșț', completes_followup_id: null,
    }, [{ offset_days: 3, channel: 'internal', active: true }], efectuata);

    expect(rezultat.followup.due_date).toBe(scadenta);
    expect(ctx.db.get('SELECT source_intervention_id, due_date, status FROM followups WHERE id = ?', rezultat.followup.id))
      .toEqual({ source_intervention_id: rezultat.intervention.id, due_date: scadenta, status: 'pending' });
    expect(ctx.db.all('SELECT followup_id, scheduled_at, status FROM reminders')).toEqual([{
      followup_id: rezultat.followup.id, scheduled_at: `${reamintire} 09:00:00`, status: 'pending',
    }]);
    expect(rezultat.remindersCreated).toBe(1);
    baza.schimbaOra(`${scadenta}T08:00:00`);
    const raport = buildDddReport(ctx, ctx.todayIso(), 'dimineata');
    expect(raport.body).toContain('AJUNG LA TERMEN ASTĂZI (1) — de contactat\n  • Asociația Bloc A7 — Dezinsecție · Ion Popescu (0712345678)');
    expect(raport.body).not.toContain('RESTANTE');
    expect(raport.summary).toBe('1 lucru de făcut azi.');
  });

  it.each([
    ['2026-08-01T00:10:00+03:00', '2026-07-31', '2026-08-01', '2026-08-02', -180],
    ['2027-01-01T00:10:00+02:00', '2026-12-31', '2027-01-01', '2027-01-02', -120],
  ] as const)('la %s selectează scheduled_at local, nu ziua UTC a câmpurilor de audit SQLite', (ora, ieri, azi, maine, decalaj) => {
    const { ctx } = baza;
    baza.schimbaOra(ora);
    expect(ctx.now().getTimezoneOffset()).toBe(decalaj);
    expect(ctx.todayIso()).toBe(azi);
    expect(ctx.nowLocalIso()).toBe(`${azi} 00:10:00`);
    const { associationId, serviceId } = seedBasics(ctx.db);
    const followup = ctx.followups.insert({ association_id: associationId, service_id: serviceId, source_intervention_id: null, due_date: maine });
    const ore = [`${ieri} 23:59:59`, `${azi} 00:10:00`, `${azi} 00:10:01`, `${maine} 00:00:00`];
    for (const [offset, programare] of ore.entries()) {
      ctx.reminders.insertIfMissing({ followup_id: followup.id, offset_days: offset, channel: 'internal', scheduled_at: programare });
    }
    // datetime(?) folosește aceeași conversie UTC ca datetime('now'), dar cu un
    // instant fix; fake Date din JavaScript NU ar îngheța ceasul intern SQLite.
    ctx.db.run('UPDATE reminders SET created_at = datetime(?), updated_at = datetime(?)', ora, ora);
    expect(ctx.db.get<{ zi: string }>('SELECT date(created_at) AS zi FROM reminders LIMIT 1')!.zi).toBe(ieri);
    expect(ctx.reminders.listDue(ctx.nowLocalIso()).map((r) => r.scheduled_at)).toEqual(ore.slice(0, 2));
    expect(ctx.reminders.windowCounts(ctx.todayIso())).toEqual({ today: 2, upcoming: 1, sent: 0, failed: 0, all: 4 });
    expect(ctx.reminders.list({ window: 'today', page: 1, pageSize: 10 }, ctx.todayIso()).items.map((r) => r.scheduled_at))
      .toEqual([`${azi} 00:10:01`, `${azi} 00:10:00`]);
  });

  it.each([
    ['2026-03-29', '2026-03-30', '+03:00', -180],
    ['2026-10-25', '2026-10-26', '+02:00', -120],
  ] as const)('schimbarea orei din %s păstrează reminderul la 09:00 local și diferența calendaristică de o zi', (azi, scadenta, offset, decalaj) => {
    const { ctx } = baza;
    const { associationId, serviceId } = seedBasics(ctx.db);
    const followup = ctx.followups.insert({ association_id: associationId, service_id: serviceId, source_intervention_id: null, due_date: scadenta });
    expect(generateRemindersForFollowup(ctx.reminders, followup, [{ offset_days: 1, channel: 'internal', active: true }], azi)).toBe(1);
    baza.schimbaOra(`${azi}T08:59:59${offset}`);
    expect(ctx.now().getTimezoneOffset()).toBe(decalaj);
    expect(ctx.reminders.listDue(ctx.nowLocalIso())).toEqual([]);
    baza.schimbaOra(`${azi}T09:00:00${offset}`);
    expect(ctx.reminders.listDue(ctx.nowLocalIso())).toEqual([
      expect.objectContaining({ followup_id: followup.id, scheduled_at: `${azi} 09:00:00` }),
    ]);
    const raport = buildDddReport(ctx, azi, 'dimineata');
    expect(raport.body).toContain('URMĂTOARELE 7 ZILE (1)');
    expect(raport.body).toContain('(mâine)');
    expect(raport.body).not.toContain('AJUNG LA TERMEN ASTĂZI');
  });
});
