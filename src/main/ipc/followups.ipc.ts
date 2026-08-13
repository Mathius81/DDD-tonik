import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  followupListFilterSchema,
  followupMarkContactedSchema,
  followupScheduleSchema,
  followupCancelSchema,
} from '../../shared/schemas/followup';
import type { AppContext } from '../app-context';

export function registerFollowupHandlers(ctx: AppContext): void {
  handle(IPC.followups.list, followupListFilterSchema, (filter) =>
    ctx.followups.list(filter, ctx.todayIso()),
  );

  handle(IPC.followups.markContacted, followupMarkContactedSchema, ({ id }) => {
    ensureExists(ctx, id);
    ctx.followups.markContacted(id);
    ctx.notifyDataChanged();
    return ctx.followups.getById(id);
  });

  handle(IPC.followups.schedule, followupScheduleSchema, (data) => {
    ensureExists(ctx, data.id);
    ctx.followups.schedule(data.id, data.scheduled_date, data.scheduled_time, data.notes);
    ctx.notifyDataChanged();
    return ctx.followups.getById(data.id);
  });

  handle(IPC.followups.cancel, followupCancelSchema, (data) => {
    ensureExists(ctx, data.id);
    ctx.db.transaction(() => {
      ctx.followups.cancel(data.id, data.notes);
      ctx.reminders.cancelPendingForFollowup(data.id);
    });
    ctx.notifyDataChanged();
    return ctx.followups.getById(data.id);
  });
}

function ensureExists(ctx: AppContext, id: number): void {
  if (!ctx.followups.getById(id)) throw new UserFacingError('Follow-up-ul nu a fost găsit.');
}
