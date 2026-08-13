import { z } from 'zod';
import { idSchema } from './common';

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, 'Denumirea este obligatorie').max(100),
  default_interval_months: z.number().int().min(1, 'Minim 1 lună').max(120),
});

export const serviceUpdateSchema = serviceCreateSchema.extend({
  id: idSchema,
  active: z.boolean(),
});

export type ServiceCreate = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdate = z.infer<typeof serviceUpdateSchema>;

export interface Service {
  id: number;
  name: string;
  default_interval_months: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}
