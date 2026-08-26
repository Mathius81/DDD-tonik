/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { ReminderRepository } from '../db/repos/reminders.repo';
import type { Followup } from '../../shared/schemas/followup';
import type { ReminderRule } from '../../shared/schemas/reminder';
import { parseIso, toIsoDate } from '../../shared/dates';

/**
 * Generează reminderele unui follow-up conform regulilor active.
 * - scheduled_at = due_date - offset_days, la ora 09:00 locală;
 * - dacă momentul rezultat e deja în trecut față de azi, reminderul se
 *   programează pentru azi (nu se pierde — spec #20);
 * - duplicatele sunt prevenite de UNIQUE(followup_id, offset_days, channel).
 */
export function generateRemindersForFollowup(
  reminders: ReminderRepository,
  followup: Followup,
  rules: ReminderRule[],
  todayIso: string,
): number {
  let created = 0;
  for (const rule of rules) {
    if (!rule.active) continue;
    const due = parseIso(followup.due_date);
    due.setDate(due.getDate() - rule.offset_days);
    let dayIso = toIsoDate(due);
    if (dayIso < todayIso) dayIso = todayIso;

    const inserted = reminders.insertIfMissing({
      followup_id: followup.id,
      offset_days: rule.offset_days,
      channel: rule.channel,
      scheduled_at: `${dayIso} 09:00:00`,
    });
    if (inserted) created++;
  }
  return created;
}
