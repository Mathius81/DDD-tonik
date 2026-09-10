/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ReportContent } from '../../src/main/services/reports/report-types';
import { splitReportId } from '../../src/main/services/reports/report-builder';

describe('Contractul rapoartelor — tipuri comune și cele șase identități', () => {
  it('ReportContent cere toate câmpurile consumate de email, notificare și navigare', () => {
    // report-types.ts exportă DOAR o interfață: verificarea relevantă este statică,
    // prin npm run typecheck, nu un apel runtime fictiv al unui modul fără logică.
    expectTypeOf<ReportContent>().toEqualTypeOf<{
      title: string; subject: string; body: string; summary: string; route: string; isEmpty: boolean;
    }>();
  });

  it.each([
    ['ddd_dimineata', 'ddd', 'dimineata'], ['ddd_seara', 'ddd', 'seara'],
    ['covoare_dimineata', 'covoare', 'dimineata'], ['covoare_seara', 'covoare', 'seara'],
    ['cauciucuri_dimineata', 'cauciucuri', 'dimineata'], ['cauciucuri_seara', 'cauciucuri', 'seara'],
  ] as const)('%s păstrează separat spațiul %s și perioada %s', (id, spatiu, perioada) => {
    expect(splitReportId(id)).toEqual([spatiu, perioada]);
  });
});
