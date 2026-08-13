import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import { calendarMonthSchema } from '../../shared/schemas/dashboard';
import type { DashboardData } from '../../shared/schemas/dashboard';
import type { AppNotification, NotificationsData } from '../../shared/schemas/notifications';
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

  // Centrul de notificări din aplicație: sarcinile curente, derivate din date.
  // Persistente prin natura lor — dispar doar când sarcina e rezolvată.
  handle(IPC.dashboard.notifications, null, (): NotificationsData => {
    const today = ctx.todayIso();
    const attention = ctx.followups.listAttention(today, 100);
    const scheduledToday = ctx.followups.listScheduledOn(today, today);
    const failedCount = ctx.reminders.countFailed() + ctx.messages.countFailed();

    const items: AppNotification[] = [];

    for (const f of scheduledToday) {
      items.push({ kind: 'scheduled_today', followup: f });
    }
    for (const f of attention) {
      if (f.days_remaining < 0) {
        items.push({ kind: 'overdue', followup: f });
      } else if (f.days_remaining === 0) {
        items.push({ kind: 'due_today', followup: f });
      } else if (f.days_remaining <= 7) {
        items.push({ kind: 'due_soon', followup: f });
      }
    }
    if (failedCount > 0) {
      items.push({ kind: 'failed_messages', followup: null, count: failedCount });
    }

    // Badge: doar ce cere acțiune acum (nu și "în curând").
    const badge = items.filter((i) => i.kind !== 'due_soon').length;

    return { items, badge };
  });
}
