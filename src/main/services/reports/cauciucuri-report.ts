/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { AppContext } from '../../app-context';
import { formatRo } from '../../../shared/dates';
import { pluralRo } from '../../../shared/text';
import { tyreSeasonLabels, type TyreStorageListItem } from '../../../shared/schemas/tyre';
import type { ReportPeriod } from '../../../shared/schemas/settings';
import type { ReportContent } from './report-types';

function fmtSet(s: TyreStorageListItem): string {
  return `  • ${s.client_name}${s.client_phone ? ` (${s.client_phone})` : ''} — ${s.plate_number} · ${s.size} · ${tyreSeasonLabels[s.season]}, ${s.quantity} buc · intrat ${formatRo(s.date_in)}`;
}

/**
 * Raportul Cauciucuri (spațiul de lucru „cauciucuri”, complet separat de DDD/Covoare).
 *
 * Aici nu există niciun concept de „termen” — depozitul e doar seturi intrate/ridicate,
 * fără scadențe. Regula generală „raportul de seară se uită la ziua următoare” nu se
 * mapează direct, așa că am adaptat-o deliberat:
 *  - Dimineața: fotografia curentă a depozitului — cele mai vechi seturi în depozit
 *    (candidați pentru un reminder către client).
 *  - Seara: recapitulare a INTRĂRILOR DE ASTĂZI (nu o proiecție spre mâine — nu există
 *    ce să proiectăm), utilă ca „ce s-a întâmplat azi la depozit”.
 */
export function buildCauciucuriReport(
  ctx: AppContext,
  todayIso: string,
  period: ReportPeriod,
): ReportContent {
  const lines: string[] = [];
  let total = 0;

  if (period === 'dimineata') {
    const inStorage = ctx.tyreStorage.listInStorage(20);
    const totalInStorage = ctx.tyreStorage.countInStorage();

    lines.push(`Raport Cauciucuri — ${formatRo(todayIso)}`);
    lines.push('');
    lines.push(`Seturi în depozit: ${totalInStorage}`);
    lines.push('');

    if (inStorage.length > 0) {
      lines.push(`SETURI MAI VECHI ÎN DEPOZIT (${inStorage.length}) — candidați pentru reminder`);
      for (const s of inStorage) lines.push(fmtSet(s));
      lines.push('');
    }
    total = inStorage.length;
  } else {
    const intakesToday = ctx.tyreStorage.listIntakesOn(todayIso, 20);

    lines.push(`Raport Cauciucuri — recapitulare ${formatRo(todayIso)}`);
    lines.push('');

    if (intakesToday.length > 0) {
      lines.push(`INTRĂRI ASTĂZI ÎN DEPOZIT (${intakesToday.length})`);
      for (const s of intakesToday) lines.push(fmtSet(s));
      lines.push('');
    }
    total = intakesToday.length;
  }

  const isEmpty = total === 0;
  if (isEmpty) {
    lines.push(
      period === 'dimineata'
        ? 'Niciun set în depozit momentan.'
        : 'Nicio intrare nouă în depozit astăzi.',
    );
    lines.push('');
  }
  lines.push('—');
  lines.push('Trimis automat de Tonik.');

  const summary =
    total > 0
      ? period === 'dimineata'
        ? `${pluralRo(total, 'set', 'seturi')} în depozit de urmărit.`
        : `${pluralRo(total, 'set nou', 'seturi noi')} intrate azi în depozit.`
      : 'Nimic de raportat la Cauciucuri.';

  return {
    title: 'Raport Cauciucuri',
    subject: `Raport Cauciucuri · ${formatRo(todayIso)} · Tonik`,
    body: lines.join('\n'),
    summary,
    route: '/cauciucuri',
    isEmpty,
  };
}
