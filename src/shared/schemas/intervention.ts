import { z } from 'zod';
import { idSchema, isoDateSchema } from './common';

export const interventionCreateSchema = z.object({
  association_id: idSchema,
  service_id: idSchema,
  performed_date: isoDateSchema,
  interval_months: z.number().int().min(1, 'Minim 1 lună').max(120),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
  /** Follow-up-ul pe care această intervenție îl finalizează (dacă vine dintr-o programare). */
  completes_followup_id: idSchema.nullish().transform((v) => v ?? null),
});

export const interventionListFilterSchema = z.object({
  association_id: idSchema.optional(),
  service_id: idSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type InterventionCreate = z.infer<typeof interventionCreateSchema>;
export type InterventionListFilter = z.infer<typeof interventionListFilterSchema>;

export interface Intervention {
  id: number;
  association_id: number;
  service_id: number;
  performed_date: string;
  interval_months: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InterventionListItem extends Intervention {
  association_name: string;
  service_name: string;
  /** Scadența follow-up-ului generat de această intervenție (dacă există). */
  next_due_date: string | null;
  next_status: string | null;
}
