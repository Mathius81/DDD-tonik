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
import { fmtDateTime, fmtUtcDateTime } from '../../src/renderer/components/dateUtils';

describe('Ora jurnalelor UTC în fusul local al utilizatorului', () => {
  beforeEach(() => vi.stubEnv('TZ', 'Europe/Bucharest'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['2026-09-10 13:05:00', '10.09.2026 16:05'],
    ['2026-01-10 13:05:00', '10.01.2026 15:05'],
    ['2026-09-10 21:30:00', '11.09.2026 00:30'],
    ['2026-03-29 00:30:00', '29.03.2026 02:30'],
    ['2026-03-29 01:30:00', '29.03.2026 04:30'],
  ])('REGRESIE P2: jurnalul %s este afișat local ca %s', (utc, local) => {
    expect(fmtUtcDateTime(utc)).toBe(local);
  });

  it('folosește fusul sistemului, nu o diferență fixă pentru România', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect(fmtUtcDateTime('2026-09-10 01:30:00')).toBe('09.09.2026 18:30');
  });

  it('datele deja locale, precum jurnalul Cauciucuri, nu sunt convertite a doua oară', () => {
    expect(fmtDateTime('2026-09-10 16:05:00')).toBe('10.09.2026 16:05');
  });

  it('valorile absente sau invalide nu strică pagina', () => {
    expect(fmtUtcDateTime(null)).toBe('—');
    expect(fmtUtcDateTime(undefined)).toBe('—');
    expect(fmtUtcDateTime('nevalid')).toBe('—');
  });
});
