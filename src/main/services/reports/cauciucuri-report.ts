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
import { addDaysIso, formatRo } from '../../../shared/dates';
import { pluralRo } from '../../../shared/text';
import { tyreSeasonLabels, type TyreAppointmentListItem, type TyreStorageListItem } from '../../../shared/schemas/tyre';
import type { ReportPeriod } from '../../../shared/schemas/settings';
import type { ReportContent } from './report-types';

function fmtSet(s: TyreStorageListItem): string {
  return `  • ${s.client_name}${s.client_phone ? ` (${s.client_phone})` : ''} — ${s.plate_number} · ${s.size} · ${tyreSeasonLabels[s.season]}, ${s.quantity} buc · intrat ${formatRo(s.date_in)}`;
}

function fmtAppointment(a: TyreAppointmentListItem): string {
  return `  • ${a.appointment_time} — ${a.client_name}${a.client_phone ? ` (${a.client_phone})` : ''} · ${a.plate_number} · ${a.work_type}${a.season ? ` · ${tyreSeasonLabels[a.season]}` : ''}`;
}

/**
 * Raportul Cauciucuri (spațiul de lucru „cauciucuri”, complet separat de DDD/Covoare).
 * Dimineața: fotografia depozitului, cu cele mai vechi seturi încă neridicate.
 * Seara: programările nefinalizate de MÂINE, ordonate după oră, plus recapitularea
 * intrărilor de AZI în depozit. Depozitul nu are scadențe; programările au dată și oră.
 */
export function buildCauciucuriReport(
  ctx: AppContext,
  todayIso: string,
  period: ReportPeriod,
): ReportContent {
  const lines: string[] = [];
  const summaryParts: string[] = [];

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
    if (totalInStorage > 0) {
      summaryParts.push(`${pluralRo(totalInStorage, 'set', 'seturi')} în depozit de urmărit`);
    }
  } else {
    const tomorrowIso = addDaysIso(todayIso, 1);
    // Filtrăm înainte de paginare: anulările/finalizările nu consumă limita de 20.
    const pending = (['programat', 'venit'] as const).map((status) => ctx.tyreAppointments.list({
      date: tomorrowIso, status, page: 1, pageSize: 20,
    }));
    const appointmentCount = pending.reduce((sum, page) => sum + page.total, 0);
    const appointments = pending.flatMap((page) => page.items)
      .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time) || a.id - b.id)
      .slice(0, 20);
    const intakesToday = ctx.tyreStorage.listIntakesOn(todayIso, 20);
    const intakeCount = ctx.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM tyre_storage_sets WHERE date_in = ?', todayIso,
    )?.n ?? 0;

    lines.push(`Raport Cauciucuri — pregătire ${formatRo(tomorrowIso)}`);
    lines.push('');

    if (appointmentCount > 0) {
      lines.push(`PROGRAMĂRI MÂINE (${appointmentCount})`);
      for (const a of appointments) lines.push(fmtAppointment(a));
      if (appointmentCount > appointments.length) {
        lines.push(`  … încă ${pluralRo(appointmentCount - appointments.length, 'programare', 'programări')}; vezi lista completă în aplicație.`);
      }
      summaryParts.push(`${pluralRo(appointmentCount, 'programare', 'programări')} pentru mâine`);
    } else {
      lines.push('Nicio programare pentru mâine.');
    }
    lines.push('');

    if (intakeCount > 0) {
      lines.push(`INTRĂRI ASTĂZI ÎN DEPOZIT (${intakeCount})`);
      for (const s of intakesToday) lines.push(fmtSet(s));
      summaryParts.push(`${pluralRo(intakeCount, 'set nou intrat', 'seturi noi intrate')} azi în depozit`);
    } else {
      lines.push('Nicio intrare nouă în depozit astăzi.');
    }
    lines.push('');
  }

  const isEmpty = summaryParts.length === 0;
  if (isEmpty && period === 'dimineata') {
    lines.push('Niciun set în depozit momentan.');
    lines.push('');
  }
  lines.push('—');
  lines.push('Trimis automat de Tonik.');

  const summary = isEmpty ? 'Nimic de raportat la Cauciucuri.' : `${summaryParts.join(' · ')}.`;

  return {
    title: 'Raport Cauciucuri',
    subject: `Raport Cauciucuri · ${formatRo(todayIso)} · Tonik`,
    body: lines.join('\n'),
    summary,
    route: '/cauciucuri',
    isEmpty,
  };
}
