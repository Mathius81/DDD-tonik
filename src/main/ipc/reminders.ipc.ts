/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import { reminderListFilterSchema, reminderRetrySchema } from '../../shared/schemas/reminder';
import type { AppContext } from '../app-context';

export function registerReminderHandlers(ctx: AppContext): void {
  handle(IPC.reminders.list, reminderListFilterSchema, (filter) =>
    ctx.reminders.list(filter, ctx.todayIso()),
  );

  handle(IPC.reminders.counts, null, () => ctx.reminders.windowCounts(ctx.todayIso()));

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
