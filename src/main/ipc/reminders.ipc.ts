import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import { reminderListFilterSchema, reminderRetrySchema } from '../../shared/schemas/reminder';
import type { AppContext } from '../app-context';

export function registerReminderHandlers(ctx: AppContext): void {
  handle(IPC.reminders.list, reminderListFilterSchema, (filter) =>
    ctx.reminders.list(filter, ctx.todayIso()),
  );

  handle(IPC.reminders.retry, reminderRetrySchema, ({ id }) => {
    const reminder = ctx.reminders.getById(id);
    if (!reminder) throw new UserFacingError('Reminderul nu a fost găsit.');
    ctx.reminders.requeue(id);
    ctx.notifyDataChanged();
    return ctx.reminders.getById(id);
  });

  handle(IPC.reminders.cancel, reminderRetrySchema, ({ id }) => {
    const reminder = ctx.reminders.getById(id);
    if (!reminder) throw new UserFacingError('Reminderul nu a fost găsit.');
    ctx.reminders.setStatus(id, 'cancelled');
    ctx.notifyDataChanged();
    return ctx.reminders.getById(id);
  });
}
