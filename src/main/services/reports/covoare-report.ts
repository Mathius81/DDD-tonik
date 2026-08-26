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
import { formatRo, addDaysIso } from '../../../shared/dates';
import { pluralRo } from '../../../shared/text';
import { carpetOrderStatusLabels, type CarpetOrderListItem } from '../../../shared/schemas/carpet';
import type { ReportPeriod } from '../../../shared/schemas/settings';
import type { ReportContent } from './report-types';

function fmtOrder(o: CarpetOrderListItem, extra?: string): string {
  const pieces = pluralRo(o.item_count, 'covor', 'covoare');
  return `  • ${o.client_name}${o.client_phone ? ` (${o.client_phone})` : ''} — ${pieces}, ${o.total_sqm} mp${extra ?? ''}`;
}

/**
 * Raportul Covoare (spațiul de lucru „covoare”, complet separat de DDD).
 *
 * Dimineața: fotografia curentă — comenzi în lucru / gata de livrat / preluate azi
 * (mapare directă pe `countsForDashboard` + `listByStatus('gata')` + `listPickedUpOn`).
 *
 * Seara: pregătire pentru MÂINE — comenzile cu termen mâine (nelivrate încă) plus
 * cele deja gata de livrat și încă în așteptare (relevante indiferent de zi, dar utile
 * de reamintit seara).
 */
export function buildCovoareReport(
  ctx: AppContext,
  todayIso: string,
  period: ReportPeriod,
): ReportContent {
  const lines: string[] = [];
  let total = 0;
  const anchorIso = period === 'dimineata' ? todayIso : addDaysIso(todayIso, 1);

  if (period === 'dimineata') {
    const counts = ctx.carpetOrders.countsForDashboard(todayIso);
    const readyToDeliver = ctx.carpetOrders.listByStatus('gata', 20);
    const todayPickups = ctx.carpetOrders.listPickedUpOn(todayIso, 20);

    lines.push(`Raport Covoare — ${formatRo(todayIso)}`);
    lines.push('');
    lines.push(
      `În lucru: ${counts.in_lucru} · Gata de livrat: ${counts.gata} · Preluate azi: ${counts.preluate_azi}`,
    );
    lines.push('');

    if (readyToDeliver.length > 0) {
      lines.push(`GATA DE LIVRAT (${readyToDeliver.length})`);
      for (const o of readyToDeliver) lines.push(fmtOrder(o));
      lines.push('');
    }
    if (todayPickups.length > 0) {
      lines.push(`PRELUATE ASTĂZI (${todayPickups.length})`);
      for (const o of todayPickups) lines.push(fmtOrder(o));
      lines.push('');
    }
    total = readyToDeliver.length + todayPickups.length;
  } else {
    const dueTomorrow = ctx.carpetOrders.listDueOn(anchorIso, 20);
    const readyToDeliver = ctx.carpetOrders.listByStatus('gata', 20);

    lines.push(`Raport Covoare — pregătire ${formatRo(anchorIso)}`);
    lines.push('');

    if (dueTomorrow.length > 0) {
      lines.push(`CU TERMEN MÂINE (${dueTomorrow.length})`);
      for (const o of dueTomorrow) {
        lines.push(fmtOrder(o, ` · ${carpetOrderStatusLabels[o.status]}`));
      }
      lines.push('');
    }
    if (readyToDeliver.length > 0) {
      lines.push(`ÎN AȘTEPTARE, GATA DE LIVRAT (${readyToDeliver.length})`);
      for (const o of readyToDeliver) lines.push(fmtOrder(o));
      lines.push('');
    }
    total = dueTomorrow.length + readyToDeliver.length;
  }

  const isEmpty = total === 0;
  if (isEmpty) {
    lines.push(
      period === 'dimineata'
        ? 'Nimic de raportat azi la Covoare.'
        : 'Nimic de pregătit pentru mâine la Covoare.',
    );
    lines.push('');
  }
  lines.push('—');
  lines.push('Trimis automat de Tonik.');

  const summary =
    total > 0
      ? `${pluralRo(total, 'comandă de urmărit', 'comenzi de urmărit')} la Covoare.`
      : 'Nimic de urmărit la Covoare.';

  return {
    title: 'Raport Covoare',
    subject: `Raport Covoare · ${formatRo(todayIso)} · Tonik`,
    body: lines.join('\n'),
    summary,
    route: '/covoare',
    isEmpty,
  };
}
