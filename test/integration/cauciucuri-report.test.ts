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
import { creeazaMasina, depuneSet } from '../helpers/tyre-fixtures';
import { buildCauciucuriReport } from '../../src/main/services/reports/cauciucuri-report';
import { tyreAppointmentCreateSchema } from '../../src/shared/schemas/tyre';

describe('Constructorul Cauciucuri — stoc, intrări și programările de mâine', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  beforeEach(() => { baza = creeazaContextTest(); });
  afterEach(() => { baza.cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each([
    ['dimineata', 'Niciun set în depozit momentan.'],
    ['seara', 'Nicio intrare nouă în depozit astăzi.'],
  ] as const)('baza goală, %s: semnalează explicit absența datelor și navighează la spațiul corect', (perioada, mesaj) => {
    const raport = buildCauciucuriReport(baza.ctx, '2026-08-14', perioada);
    expect(raport).toMatchObject({ title: 'Raport Cauciucuri', subject: 'Raport Cauciucuri · 14.08.2026 · Tonik', summary: 'Nimic de raportat la Cauciucuri.', route: '/cauciucuri', isEmpty: true });
    expect(raport.body).toContain(mesaj);
    expect(raport.body).toMatch(/\n—\nTrimis automat de Tonik\.$/);
  });

  it('dimineața arată cele mai vechi seturi întâi, cu datele complete, și exclude seturile ridicate', () => {
    const { ctx } = baza;
    const noua = creeazaMasina(ctx, 'Client fără telefon');
    const veche = creeazaMasina(ctx, "Ștefan O'Brien & fii", '0712345678');
    const ridicata = creeazaMasina(ctx, 'RIDICAT EXCLUS');
    depuneSet(ctx, noua.id, 'vara', '2026-08-13');
    depuneSet(ctx, veche.id, 'iarna', '2026-01-31');
    const ridicat = depuneSet(ctx, ridicata.id, 'iarna', '2025-12-01');
    ctx.tyreStorage.pickup(ridicat.id, '2026-08-14');
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'dimineata');
    expect(raport.body).toContain('Seturi în depozit: 2');
    expect(raport.body.split('\n').filter((linie) => linie.startsWith('  •'))).toEqual([
      `  • Ștefan O'Brien & fii (0712345678) — ${veche.plate_number} · 205/55 R16 · Iarnă, 4 buc · intrat 31.01.2026`,
      `  • Client fără telefon — ${noua.plate_number} · 205/55 R16 · Vară, 4 buc · intrat 13.08.2026`,
    ]);
    expect(raport.body).not.toMatch(/RIDICAT EXCLUS|null|undefined|\(\)/);
    expect(raport.summary).toBe('2 seturi în depozit de urmărit.');
    expect(raport.isEmpty).toBe(false);
  });

  it('un singur set folosește singularul și nu inventează brand sau telefon pentru date lipsă', () => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Client');
    depuneSet(ctx, masina.id, 'iarna', '2028-02-29');
    // Date istorice fără nume: SQLite permite șirul gol, nu NULL.
    ctx.db.run('UPDATE tyre_clients SET name = ? WHERE id = ?', '', masina.client_id);
    const raport = buildCauciucuriReport(ctx, '2028-03-01', 'dimineata');
    expect(raport.summary).toBe('1 set în depozit de urmărit.');
    expect(raport.body).toContain(`  •  — ${masina.plate_number} · 205/55 R16 · Iarnă, 4 buc · intrat 29.02.2028`);
    expect(raport.body).not.toMatch(/null|undefined/);
  });

  it('cele 21 de seturi au contor complet, dar detaliile conțin doar cele mai vechi 20', () => {
    const { ctx } = baza;
    // Ordinea inserării este inversă celei calendaristice, ca un ORDER BY id să pice.
    for (let zi = 21; zi >= 1; zi--) {
      const masina = creeazaMasina(ctx, `Client ${String(zi).padStart(2, '0')}`);
      depuneSet(ctx, masina.id, 'iarna', `2026-01-${String(zi).padStart(2, '0')}`);
    }
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'dimineata');
    expect(raport.body).toContain('Seturi în depozit: 21');
    expect(raport.body).toContain('SETURI MAI VECHI ÎN DEPOZIT (20)');
    expect(raport.body.split('\n').filter((linie) => linie.startsWith('  •'))).toHaveLength(20);
    expect(raport.body).toContain('Client 01');
    expect(raport.body).not.toContain('Client 21');
    expect(raport.summary).toBe('21 de seturi în depozit de urmărit.');
  });

  it('recapitularea existentă de seară filtrează exact intrările de azi, inclusiv un set ridicat ulterior', () => {
    // Recapitularea depozitului rămâne separată de programările pentru mâine.
    const { ctx } = baza;
    for (const [nume, data, ridicat] of [
      ['Intrat azi', '2026-08-14', false], ['Intrat azi și ridicat', '2026-08-14', true],
      ['IERI EXCLUS', '2026-08-13', false], ['MÂINE NU ESTE INTRARE AZI', '2026-08-15', false],
    ] as const) {
      const masina = creeazaMasina(ctx, nume);
      const set = depuneSet(ctx, masina.id, 'iarna', data);
      if (ridicat) ctx.tyreStorage.pickup(set.id, data);
    }
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.body).toContain('INTRĂRI ASTĂZI ÎN DEPOZIT (2)');
    expect(raport.body).toContain('Intrat azi și ridicat');
    expect(raport.body).not.toMatch(/IERI EXCLUS|MÂINE NU ESTE INTRARE AZI/);
    expect(raport.summary).toBe('2 seturi noi intrate azi în depozit.');
    expect(raport.isEmpty).toBe(false);
  });

  // Programările de mâine țin raportul activ chiar dacă depozitul nu are intrări azi.
  it('REGRESIE: raportul de seară pregătește programarea de mâine, inclusiv peste an, nu doar depozitul de azi', () => {
    const { ctx } = baza;
    const azi = creeazaMasina(ctx, 'CLIENT AZI EXCLUS');
    const maine = creeazaMasina(ctx, 'Client programat mâine');
    for (const [masina, data] of [[azi, '2026-12-31'], [maine, '2027-01-01']] as const) {
      ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
        vehicle_id: masina.id, appointment_date: data, appointment_time: '09:30', work_type: 'Schimb de sezon',
      }));
    }
    const raport = buildCauciucuriReport(ctx, '2026-12-31', 'seara');
    expect(raport.body).toContain('Raport Cauciucuri — pregătire 01.01.2027');
    expect(raport.body).toContain('PROGRAMĂRI MÂINE (1)');
    expect(raport.body).toContain(`  • 09:30 — Client programat mâine · ${maine.plate_number} · Schimb de sezon`);
    expect(raport.summary).toBe('1 programare pentru mâine.');
    expect(raport.body).not.toContain('CLIENT AZI EXCLUS');
    expect(raport.isEmpty).toBe(false);
  });

  it.each([
    ['2028-02-28', '2028-02-29', '29.02.2028'],
    ['2028-02-29', '2028-03-01', '01.03.2028'],
    ['2026-03-28', '2026-03-29', '29.03.2026'],
    ['2026-10-24', '2026-10-25', '25.10.2026'],
  ])('seara din %s folosește ziua calendaristică următoare, inclusiv în an bisect și la schimbarea orei', (azi, maine, local) => {
    vi.stubEnv('TZ', 'Europe/Bucharest');
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Client de mâine');
    ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
      vehicle_id: masina.id, appointment_date: maine, appointment_time: '08:00', work_type: 'Montaj',
    }));
    const raport = buildCauciucuriReport(ctx, azi, 'seara');
    expect(raport.body).toContain(`Raport Cauciucuri — pregătire ${local}`);
    expect(raport.body).toContain('Client de mâine');
    expect(raport.isEmpty).toBe(false);
  });

  it('ordonează programările nefinalizate după oră și id, cu telefon, mașină, lucrare și sezon', () => {
    const { ctx } = baza;
    const seara = creeazaMasina(ctx, 'Mai târziu');
    const prima = creeazaMasina(ctx, "Ștefan O'Brien & fii", '0712345678');
    const aDoua = creeazaMasina(ctx, 'Al doilea la aceeași oră');
    const anulat = creeazaMasina(ctx, 'ANULAT EXCLUS');
    const finalizat = creeazaMasina(ctx, 'FINALIZAT EXCLUS');
    for (const [masina, ora, stare] of [
      [seara, '16:00', 'venit'], [prima, '08:00', 'programat'], [aDoua, '08:00', 'venit'],
      [anulat, '07:00', 'anulat'], [finalizat, '07:30', 'finalizat'],
    ] as const) {
      const a = ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
        vehicle_id: masina.id, appointment_date: '2026-08-15', appointment_time: ora, work_type: 'Schimb de sezon', season: 'iarna',
      }));
      ctx.tyreAppointments.setStatus({ id: a.id, status: stare });
    }
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.body.split('\n').filter((linie) => linie.startsWith('  •'))).toEqual([
      `  • 08:00 — Ștefan O'Brien & fii (0712345678) · ${prima.plate_number} · Schimb de sezon · Iarnă`,
      `  • 08:00 — Al doilea la aceeași oră · ${aDoua.plate_number} · Schimb de sezon · Iarnă`,
      `  • 16:00 — Mai târziu · ${seara.plate_number} · Schimb de sezon · Iarnă`,
    ]);
    expect(raport.body).not.toMatch(/ANULAT EXCLUS|FINALIZAT EXCLUS|null|undefined/);
    expect(raport.summary).toBe('3 programări pentru mâine.');
  });

  it.each(['anulat', 'finalizat'] as const)('numai programări în starea %s nu generează raport pentru ziua următoare', (status) => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Nu mai este de făcut');
    const a = ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
      vehicle_id: masina.id, appointment_date: '2026-08-15', appointment_time: '09:30', work_type: 'Montaj',
    }));
    ctx.tyreAppointments.setStatus({ id: a.id, status });
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.isEmpty).toBe(true);
    expect(raport.body).toContain('Nicio programare pentru mâine.');
    expect(raport.body).not.toContain('Nu mai este de făcut');
  });

  it('numără programările separat de seturi, chiar dacă ambele aparțin aceleiași mașini', () => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Client cu set și programare');
    depuneSet(ctx, masina.id, 'iarna', '2026-08-14');
    ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
      vehicle_id: masina.id, appointment_date: '2026-08-15', appointment_time: '09:30', work_type: 'Montaj',
    }));
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.body).toContain('PROGRAMĂRI MÂINE (1)');
    expect(raport.body).toContain('INTRĂRI ASTĂZI ÎN DEPOZIT (1)');
    expect(raport.summary).toBe('1 programare pentru mâine · 1 set nou intrat azi în depozit.');
    expect(raport.isEmpty).toBe(false);
  });

  it('păstrează totalul și primele 20 de programări active chiar după multe anulări și peste ambele stări', () => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Client');
    for (let i = 0; i < 45; i++) {
      const a = ctx.tyreAppointments.create(tyreAppointmentCreateSchema.parse({
        vehicle_id: masina.id, appointment_date: '2026-08-15', appointment_time: '09:30', work_type: `Lucrarea ${i}`,
      }));
      ctx.tyreAppointments.setStatus({ id: a.id, status: i < 20 ? 'anulat' : i % 2 === 0 ? 'programat' : 'venit' });
    }
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.summary).toBe('25 de programări pentru mâine.');
    expect(raport.body).toContain('PROGRAMĂRI MÂINE (25)');
    expect(raport.body).toContain('încă 5 programări');
    const detalii = raport.body.split('\n').filter((linie) => linie.startsWith('  •'));
    expect(detalii).toHaveLength(20);
    expect(detalii[0]).toContain('Lucrarea 20');
    expect(detalii[19]).toContain('Lucrarea 39');
  });

  it('recapitularea de seară numără toate intrările, nu doar cele 20 de detalii afișate', () => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Client');
    for (let i = 0; i < 21; i++) depuneSet(ctx, masina.id, 'iarna', '2026-08-14');
    const raport = buildCauciucuriReport(ctx, '2026-08-14', 'seara');
    expect(raport.summary).toBe('21 de seturi noi intrate azi în depozit.');
    expect(raport.body).toContain('INTRĂRI ASTĂZI ÎN DEPOZIT (21)');
    expect(raport.body.split('\n').filter((linie) => linie.startsWith('  •'))).toHaveLength(20);
  });
});
