import { z } from 'zod';
import { idSchema } from './common';

export const associationCreateSchema = z.object({
  name: z.string().trim().min(1, 'Denumirea este obligatorie').max(200),
  tax_id: z.string().trim().max(20).nullish().transform((v) => v || null),
  address: z.string().trim().min(1, 'Adresa este obligatorie').max(300),
  city: z.string().trim().max(100).nullish().transform((v) => v || null),
  county: z.string().trim().max(100).nullish().transform((v) => v || null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const associationUpdateSchema = associationCreateSchema.extend({
  id: idSchema,
  active: z.boolean(),
});

export const associationListFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type AssociationCreate = z.infer<typeof associationCreateSchema>;
export type AssociationUpdate = z.infer<typeof associationUpdateSchema>;
export type AssociationListFilter = z.infer<typeof associationListFilterSchema>;

export interface Association {
  id: number;
  name: string;
  tax_id: string | null;
  address: string;
  city: string | null;
  county: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de asociații, cu informații agregate. */
export interface AssociationListItem extends Association {
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  next_due_date: string | null;
  next_service_name: string | null;
}
