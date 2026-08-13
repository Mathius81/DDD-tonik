import { z } from 'zod';
import { idSchema, isoDateSchema, timeSchema } from './common';

export const followupStatuses = ['pending', 'contacted', 'scheduled', 'completed', 'cancelled'] as const;
export type FollowupStatus = (typeof followupStatuses)[number];

/** Etichete UI în română pentru statusurile de follow-up. */
export const followupStatusLabels: Record<FollowupStatus, string> = {
  pending: 'De contactat',
  contacted: 'Contactat',
  scheduled: 'Programat',
  completed: 'Efectuat',
  cancelled: 'Anulat',
};

export const followupListFilterSchema = z.object({
  association_id: idSchema.optional(),
  status: z.enum([...followupStatuses, 'all'] as const).default('all'),
  /** 'overdue' | 'next7' | 'next30' — ferestre pentru dashboard */
  window: z.enum(['overdue', 'today', 'next7', 'next30', 'all']).default('all'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const followupMarkContactedSchema = z.object({ id: idSchema });

export const followupScheduleSchema = z.object({
  id: idSchema,
  scheduled_date: isoDateSchema,
  scheduled_time: timeSchema.nullish().transform((v) => v ?? null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const followupCancelSchema = z.object({
  id: idSchema,
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export type FollowupListFilter = z.infer<typeof followupListFilterSchema>;
export type FollowupSchedule = z.infer<typeof followupScheduleSchema>;

export interface Followup {
  id: number;
  association_id: number;
  service_id: number;
  source_intervention_id: number | null;
  due_date: string;
  status: FollowupStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  contacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupListItem extends Followup {
  association_name: string;
  service_name: string;
  days_remaining: number;
  primary_contact_id: number | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  primary_contact_do_not_contact: boolean;
}
