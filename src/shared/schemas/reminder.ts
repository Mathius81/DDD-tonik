import { z } from 'zod';
import { idSchema } from './common';

export const reminderChannels = ['whatsapp', 'email', 'internal'] as const;
export type ReminderChannel = (typeof reminderChannels)[number];

export const reminderStatuses = ['pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped'] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];

export const reminderChannelLabels: Record<ReminderChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  internal: 'Notificare internă',
};

export const reminderStatusLabels: Record<ReminderStatus, string> = {
  pending: 'În așteptare',
  processing: 'În curs',
  sent: 'Trimis',
  failed: 'Eșuat',
  cancelled: 'Anulat',
  skipped: 'Omis',
};

export const reminderListFilterSchema = z.object({
  window: z.enum(['today', 'upcoming', 'sent', 'failed', 'all']).default('today'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const reminderRetrySchema = z.object({ id: idSchema });

export type ReminderListFilter = z.infer<typeof reminderListFilterSchema>;

export interface Reminder {
  id: number;
  followup_id: number;
  offset_days: number;
  channel: ReminderChannel;
  scheduled_at: string;
  status: ReminderStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderListItem extends Reminder {
  association_id: number;
  association_name: string;
  service_name: string;
  due_date: string;
  recipient_name: string | null;
  recipient_detail: string | null;
}

/** Regulă configurabilă de generare a reminderelor. */
export const reminderRuleSchema = z.object({
  offset_days: z.number().int().min(0).max(365),
  channel: z.enum(reminderChannels),
  active: z.boolean().default(true),
});

export const reminderRulesSchema = z
  .array(reminderRuleSchema)
  .max(20)
  .refine(
    (rules) => new Set(rules.map((r) => `${r.offset_days}|${r.channel}`)).size === rules.length,
    'Există reguli duplicate (același interval și canal)',
  );

export type ReminderRule = z.infer<typeof reminderRuleSchema>;

export const defaultReminderRules: ReminderRule[] = [
  { offset_days: 30, channel: 'whatsapp', active: true },
  { offset_days: 14, channel: 'whatsapp', active: true },
  { offset_days: 3, channel: 'internal', active: true },
];
