import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  interventionCreateSchema,
  interventionListFilterSchema,
} from '../../shared/schemas/intervention';
import { isoDateSchema } from '../../shared/schemas/common';
import { saveIntervention } from '../domain/followup-engine';
import { addMonthsClamped } from '../../shared/dates';
import type { AppContext } from '../app-context';

export function registerInterventionHandlers(ctx: AppContext): void {
  handle(IPC.interventions.list, interventionListFilterSchema, (filter) =>
    ctx.interventions.list(filter),
  );

  handle(IPC.interventions.create, interventionCreateSchema, (data) => {
    const service = ctx.services.getById(data.service_id);
    if (!service) throw new UserFacingError('Serviciul selectat nu există.');
    const association = ctx.associations.getById(data.association_id);
    if (!association) throw new UserFacingError('Asociația selectată nu există.');

    const rules = ctx.settings.get().reminder_rules;
    const result = saveIntervention(ctx.db, data, rules, ctx.todayIso());
    ctx.logger.info(
      `Intervenție #${result.intervention.id} salvată; follow-up #${result.followup.id} scadent ${result.followup.due_date}; ${result.remindersCreated} remindere`,
    );
    ctx.notifyDataChanged();
    return result;
  });

  // Pentru formular: arată data următoarei intervenții pe măsură ce utilizatorul tastează.
  handle(
    IPC.interventions.previewDueDate,
    z.object({ performed_date: isoDateSchema, interval_months: z.number().int().min(1).max(120) }),
    ({ performed_date, interval_months }) => ({
      due_date: addMonthsClamped(performed_date, interval_months),
    }),
  );
}
