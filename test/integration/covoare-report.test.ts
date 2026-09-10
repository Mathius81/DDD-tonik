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
import { buildCovoareReport } from '../../src/main/services/reports/covoare-report';
import type { CarpetOrderStatus } from '../../src/shared/schemas/carpet';

function sectiune(corp: string, titlu: string): string {
  return corp.split('\n\n').find((bloc) => bloc.startsWith(titlu)) ?? '';
}

describe('Constructorul Covoare — comenzi și suprafețe reale', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  beforeEach(() => { baza = creeazaContextTest(); });
  afterEach(() => { baza.cleanup(); vi.restoreAllMocks(); });

  function comanda(nume: string, stare: CarpetOrderStatus, preluare: string, termen: string | null, optiuni: {
    telefon?: string; dimensiuni?: [number, number][];
  } = {}) {
    // Apelul direct în repo permite și date istorice incomplete (nume gol / zero covoare).
    return baza.ctx.carpetOrders.create({
      client_id: null, client_name: nume, client_phone: optiuni.telefon ?? null, client_address: null, client_notes: null,
      pickup_date: preluare, due_date: termen, status: stare, price_per_sqm: null, notes: null,
      items: (optiuni.dimensiuni ?? [[2, 3]]).map(([lungime, latime]) => ({ type: 'covor', length_m: lungime, width_m: latime })),
    });
  }

  it.each([
    ['dimineata', 'Nimic de raportat azi la Covoare.'],
    ['seara', 'Nimic de pregătit pentru mâine la Covoare.'],
  ] as const)('baza goală, %s: raport complet dar marcat gol pentru a nu trimite notificări inutile', (perioada, mesaj) => {
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', perioada);
    expect(raport).toMatchObject({ title: 'Raport Covoare', subject: 'Raport Covoare · 14.08.2026 · Tonik', route: '/covoare', isEmpty: true, summary: 'Nimic de urmărit la Covoare.' });
    expect(raport.body).toContain(mesaj);
    expect(raport.body).toMatch(/\n—\nTrimis automat de Tonik\.$/);
  });

  it('dimineața afișează contoare distincte, numărul efectiv de covoare, suma mp și telefonul doar când există', () => {
    comanda("Ștefan O'Brien & fii", 'gata', '2026-08-12', null, { telefon: '0712345678', dimensiuni: [[2, 3], [1.5, 2]] });
    comanda('Preluată azi', 'in_lucru', '2026-08-14', null);
    comanda('LIVRATĂ ÎNAINTE', 'livrat', '2026-08-11', null);
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(raport.body).toContain('În lucru: 1 · Gata de livrat: 1 · Preluate azi: 1');
    expect(sectiune(raport.body, 'GATA DE LIVRAT')).toBe("GATA DE LIVRAT (1)\n  • Ștefan O'Brien & fii (0712345678) — 2 covoare, 9 mp");
    expect(sectiune(raport.body, 'PRELUATE')).toBe('PRELUATE ASTĂZI (1)\n  • Preluată azi — 1 covor, 6 mp');
    expect(raport.body).not.toContain('LIVRATĂ ÎNAINTE');
    expect(raport.summary).toBe('2 comenzi de urmărit la Covoare.');
    expect(raport.isEmpty).toBe(false);
  });

  it.each(['dimineata', 'seara'] as const)('REGRESIE P3: suma SQLite 6.99 + 4.39 apare ca 11.38 mp în raportul de %s', (perioada) => {
    comanda('Suprafață fracționară', 'gata', '2026-08-14', '2026-08-15', { dimensiuni: [[6.99, 1], [4.39, 1]] });
    expect(baza.ctx.carpetOrders.listByStatus('gata', 20)[0].total_sqm).toBe(11.379999999999999);
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', perioada);
    expect(raport.body).toContain('2 covoare, 11.38 mp');
    expect(raport.body).not.toContain('11.379999999999999');
  });

  it('comanda fără covoare și clientul fără nume/telefon nu dispar și nu produc null sau NaN în raport', () => {
    comanda('', 'gata', '2026-08-12', null, { dimensiuni: [] });
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(sectiune(raport.body, 'GATA DE LIVRAT')).toBe('GATA DE LIVRAT (1)\n  •  — 0 de covoare, 0 mp');
    expect(raport.body).not.toMatch(/null|undefined|NaN|\(\)/);
    expect(raport.summary).toBe('1 comandă de urmărit la Covoare.');
  });

  it.each([
    ['2026-12-31', '2027-01-01', '01.01.2027'],
    ['2028-02-28', '2028-02-29', '29.02.2028'],
    ['2028-02-29', '2028-03-01', '01.03.2028'],
  ])('seara din %s include termenul de mâine, nu pe cel de azi și nu comenzile deja livrate', (azi, maine, dataRo) => {
    comanda('Termen mâine', 'in_lucru', azi, maine);
    comanda('TERMEN AZI EXCLUS', 'in_lucru', azi, azi);
    comanda('LIVRATĂ EXCLUSĂ', 'livrat', azi, maine);
    comanda('FĂRĂ TERMEN EXCLUSĂ', 'preluat', azi, null);
    comanda('Gata fără termen', 'gata', azi, null);
    const raport = buildCovoareReport(baza.ctx, azi, 'seara');
    expect(raport.body).toContain(`Raport Covoare — pregătire ${dataRo}`);
    expect(sectiune(raport.body, 'CU TERMEN')).toBe('CU TERMEN MÂINE (1)\n  • Termen mâine — 1 covor, 6 mp · În lucru');
    expect(sectiune(raport.body, 'ÎN AȘTEPTARE')).toBe('ÎN AȘTEPTARE, GATA DE LIVRAT (1)\n  • Gata fără termen — 1 covor, 6 mp');
    expect(raport.body).not.toMatch(/TERMEN AZI EXCLUS|LIVRATĂ EXCLUSĂ|FĂRĂ TERMEN EXCLUSĂ/);
    expect(raport.summary).toBe('2 comenzi de urmărit la Covoare.');
    expect(raport.isEmpty).toBe(false);
  });

  it('limitează detaliile la 20 de comenzi, dar păstrează contorul total real din bază', () => {
    for (let i = 1; i <= 21; i++) comanda(`Client ${String(i).padStart(2, '0')}`, 'gata', '2026-08-13', null);
    baza.ctx.db.run("UPDATE carpet_orders SET updated_at = '2026-08-13 12:00:00'");
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(raport.body).toContain('Gata de livrat: 21');
    expect(sectiune(raport.body, 'GATA DE LIVRAT').split('\n')).toHaveLength(21);
    expect(raport.body).toContain('Client 21');
    expect(raport.body).not.toContain('Client 01');
    expect(raport.summary).toBe('21 de comenzi de urmărit la Covoare.');
  });

  // Comenzile în lucru apar în contor și trebuie să împiedice suprimarea raportului.
  it('REGRESIE: o singură comandă în lucru din ziua anterioară nu trebuie să facă raportul de dimineață gol', () => {
    comanda('Comandă de continuat', 'in_lucru', '2026-08-13', '2026-08-15');
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(raport.isEmpty).toBe(false);
    expect(raport.summary).toBe('1 comandă de urmărit la Covoare.');
    expect(raport.body).not.toContain('Nimic de raportat');
  });

  // O comandă poate apărea în mai multe secțiuni, dar se numără o singură dată.
  it.each(['dimineata', 'seara'] as const)('REGRESIE: o comandă prezentă în două secțiuni nu devine două comenzi în rezumatul de %s', (perioada) => {
    comanda('O singură comandă', 'gata', '2026-08-14', '2026-08-15');
    expect(buildCovoareReport(baza.ctx, '2026-08-14', perioada).summary).toBe('1 comandă de urmărit la Covoare.');
  });

  it.each(['dimineata', 'seara'] as const)('rezumatul de %s numără toate comenzile distincte și după limita detaliilor', (perioada) => {
    for (let i = 1; i <= 25; i++) comanda(`Client ${i}`, 'gata', '2026-08-14', '2026-08-15');
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', perioada);
    expect(raport.summary).toBe('25 de comenzi de urmărit la Covoare.');
    expect(raport.isEmpty).toBe(false);
    // Cele două liste au ordini diferite; deduplicarea doar a rândurilor afișate nu ajunge.
    expect(raport.body.split('\n').filter((linie) => linie.startsWith('  •'))).toHaveLength(40);
  });

  it('dimineața reuniunea include activitatea de azi, dar nu lucrările livrate în zile anterioare', () => {
    comanda('În lucru de ieri', 'in_lucru', '2026-08-13', null);
    comanda('Gata și preluată azi', 'gata', '2026-08-14', null);
    comanda('Preluată și livrată azi', 'livrat', '2026-08-14', null);
    comanda('LIVRATĂ IERI EXCLUSĂ', 'livrat', '2026-08-13', null);
    const raport = buildCovoareReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(raport.summary).toBe('3 comenzi de urmărit la Covoare.');
    expect(raport.body).toContain('Preluată și livrată azi');
    expect(raport.body).not.toContain('LIVRATĂ IERI EXCLUSĂ');
  });
});
