import { z } from 'zod';
import type { FollowupListItem } from './followup';
import type { MessageLogListItem } from './message';

export interface DashboardCounts {
  overdue: number;
  next7: number;
  next30: number;
  scheduled: number;
  failed_messages: number;
}

export interface DashboardData {
  counts: DashboardCounts;
  attention: FollowupListItem[];
  scheduledToday: FollowupListItem[];
  pendingMessages: MessageLogListItem[];
}

export const calendarMonthSchema = z.object({
  /** 'YYYY-MM' */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  service_id: z.number().int().positive().optional(),
});

export type CalendarMonthInput = z.infer<typeof calendarMonthSchema>;

export interface CalendarDayEntry {
  date: string;
  kind: 'due' | 'scheduled';
  followup_id: number;
  association_id: number;
  association_name: string;
  service_id: number;
  service_name: string;
  scheduled_time: string | null;
  status: string;
}
