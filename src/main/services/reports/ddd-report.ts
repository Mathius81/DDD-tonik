import type { AppContext } from '../../app-context';
import { formatRo, addDaysIso } from '../../../shared/dates';
import { roLongDate, pluralRo, dueContext } from '../../../shared/text';
import type { FollowupListItem } from '../../../shared/schemas/followup';
import type { ReportPeriod } from '../../../shared/schemas/settings';
import type { ReportContent } from './report-types';

function fmtRow(f: FollowupListItem, extra?: string): string {
  const contact = f.primary_contact_name
    ? ` · ${f.primary_contact_name}${f.primary_contact_phone ? ` (${f.primary_contact_phone})` : ''}`
    : '';
  return `  • ${f.association_name} — ${f.service_name}${extra ?? ''}${contact}`;
}

/**
 * Raportul DDD („planul zilei”).
 *
 * Dimineața: exact comportamentul vechi, neschimbat — planul zilei de AZI (programări,
 * scadențe, restanțe, următoarele 7 zile), inclusiv mesajul de rezervă „Nimic urgent
 * astăzi” când nu-i nimic de raportat (acest raport se trimite mereu, chiar și gol).
 *
 * Seara: aceleași secțiuni, dar cu ancora pe ziua următoare — „ce e de făcut mâine”.
 * Reutilizează `listScheduledOn`/`listAttention` fără nicio modificare a acestora,
 * doar schimbând data-ancoră transmisă.
 */
export function buildDddReport(
  ctx: AppContext,
  todayIso: string,
  period: ReportPeriod,
): ReportContent {
  const anchorIso = period === 'dimineata' ? todayIso : addDaysIso(todayIso, 1);
  const scheduled = ctx.followups.listScheduledOn(anchorIso, todayIso);
  const attention = ctx.followups.listAttention(anchorIso, 100);
  const overdue = attention.filter((f) => f.days_remaining < 0);
  const dueAnchor = attention.filter((f) => f.days_remaining === 0);
  const next7 = attention.filter((f) => f.days_remaining > 0 && f.days_remaining <= 7);
  const failed = ctx.reminders.countFailed() + ctx.messages.countFailed();

  const heading = period === 'dimineata' ? 'Planul zilei' : 'Pregătire pentru mâine';
  const lines: string[] = [];
  lines.push(`${heading} — ${roLongDate(ctx.now())}`);
  lines.push('');

  const scheduledLabel = period === 'dimineata' ? 'PROGRAMATE ASTĂZI' : 'PROGRAMATE MÂINE';
  if (scheduled.length > 0) {
    lines.push(`${scheduledLabel} (${scheduled.length})`);
    for (const f of scheduled) {
      lines.push(fmtRow(f, f.scheduled_time ? ` · ora ${f.scheduled_time}` : ''));
    }
    lines.push('');
  }

  const dueLabel = period === 'dimineata' ? 'AJUNG LA TERMEN ASTĂZI' : 'AJUNG LA TERMEN MÂINE';
  if (dueAnchor.length > 0) {
    lines.push(`${dueLabel} (${dueAnchor.length}) — de contactat`);
    for (const f of dueAnchor) lines.push(fmtRow(f));
    lines.push('');
  }

  if (overdue.length > 0) {
    lines.push(`RESTANTE (${overdue.length}) — de contactat urgent`);
    for (const f of overdue) {
      lines.push(fmtRow(f, ` · ${dueContext(f.days_remaining).label}`));
    }
    lines.push('');
  }

  if (next7.length > 0) {
    lines.push(`URMĂTOARELE 7 ZILE (${next7.length})`);
    for (const f of next7) {
      lines.push(fmtRow(f, ` · ${formatRo(f.due_date)} (${dueContext(f.days_remaining).label})`));
    }
    lines.push('');
  }

  if (failed > 0) {
    lines.push(
      `⚠ ${pluralRo(failed, 'mesaj eșuat necesită', 'mesaje eșuate necesită')} atenție în aplicație.`,
    );
    lines.push('');
  }

  const isEmpty =
    scheduled.length === 0 && dueAnchor.length === 0 && overdue.length === 0 && next7.length === 0;
  if (isEmpty) {
    lines.push(
      period === 'dimineata'
        ? 'Nimic urgent astăzi — totul este la zi. ✓'
        : 'Nimic programat pentru mâine — totul este la zi. ✓',
    );
    lines.push('');
  }

  lines.push('—');
  lines.push('Trimis automat de Tonik.');

  const total = scheduled.length + dueAnchor.length + overdue.length + next7.length;
  const summary =
    total > 0
      ? `${pluralRo(total, 'lucru de făcut', 'lucruri de făcut')} ${period === 'dimineata' ? 'azi' : 'mâine'}${overdue.length > 0 ? ` (${overdue.length} restante)` : ''}.`
      : `Nimic ${period === 'dimineata' ? 'urgent azi' : 'programat mâine'}.`;

  return {
    title: heading,
    subject: `${heading} · ${formatRo(anchorIso)} · Tonik`,
    body: lines.join('\n'),
    summary,
    route: '/ddd',
    isEmpty,
  };
}
