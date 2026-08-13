import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import { calendarMonthSchema } from '../../shared/schemas/dashboard';
import type { DashboardData } from '../../shared/schemas/dashboard';
import type { AppContext } from '../app-context';

export function registerDashboardHandlers(ctx: AppContext): void {
  handle(IPC.dashboard.get, null, (): DashboardData => {
    const today = ctx.todayIso();
    const counts = ctx.followups.counts(today);
    return {
      counts: {
        ...counts,
        failed_messages: ctx.reminders.countFailed() + ctx.messages.countFailed(),
      },
      attention: ctx.followups.listAttention(today, 100),
    };
  });

  handle(IPC.dashboard.calendarMonth, calendarMonthSchema, ({ month, service_id }) =>
    ctx.followups.calendarMonth(month, service_id),
  );
}
