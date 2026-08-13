import type { Db } from '../db/database';
import { FollowupRepository } from '../db/repos/followups.repo';
import { InterventionRepository } from '../db/repos/interventions.repo';
import { ReminderRepository } from '../db/repos/reminders.repo';
import { addMonthsClamped } from '../../shared/dates';
import type { InterventionCreate , Intervention } from '../../shared/schemas/intervention';
import type { Followup } from '../../shared/schemas/followup';
import type { ReminderRule } from '../../shared/schemas/reminder';
import { generateRemindersForFollowup } from './reminder-rules';

export interface SaveInterventionResult {
  intervention: Intervention;
  followup: Followup;
  remindersCreated: number;
}

/**
 * Regula centrală a aplicației (spec #15):
 * totul într-o singură tranzacție — dacă orice pas eșuează, ROLLBACK.
 *
 *   salvează intervenția
 *   → marchează follow-up-ul anterior ca 'completed' (+ anulează reminderele lui pending)
 *   → calculează due_date prin aritmetică de calendar
 *   → creează follow-up nou
 *   → generează reminderele conform regulilor
 */
export function saveIntervention(
  db: Db,
  input: InterventionCreate,
  rules: ReminderRule[],
  todayIso: string,
): SaveInterventionResult {
  const interventions = new InterventionRepository(db);
  const followups = new FollowupRepository(db);
  const reminders = new ReminderRepository(db);

  return db.transaction(() => {
    const intervention = interventions.insert({
      association_id: input.association_id,
      service_id: input.service_id,
      performed_date: input.performed_date,
      interval_months: input.interval_months,
      notes: input.notes,
    });

    // Închide follow-up-urile deschise pentru aceeași asociație + serviciu.
    // Dacă utilizatorul a pornit dintr-o programare, follow-up-ul ei e inclus aici.
    const open = followups.findOpen(input.association_id, input.service_id);
    for (const f of open) {
      followups.setStatus(f.id, 'completed');
      reminders.cancelPendingForFollowup(f.id);
    }

    const dueDate = addMonthsClamped(input.performed_date, input.interval_months);

    const followup = followups.insert({
      association_id: input.association_id,
      service_id: input.service_id,
      source_intervention_id: intervention.id,
      due_date: dueDate,
    });

    const remindersCreated = generateRemindersForFollowup(reminders, followup, rules, todayIso);

    return { intervention, followup, remindersCreated };
  });
}
