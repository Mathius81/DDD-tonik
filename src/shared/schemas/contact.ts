import { z } from 'zod';
import { idSchema } from './common';

export const contactRoles = ['Administrator', 'Președinte', 'Vicepreședinte', 'Responsabil', 'Altul'] as const;
export const contactChannels = ['whatsapp', 'email', 'sms', 'phone'] as const;

export const contactCreateSchema = z.object({
  association_id: idSchema,
  name: z.string().trim().min(1, 'Numele este obligatoriu').max(200),
  role: z.enum(contactRoles).default('Administrator'),
  phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  email: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, 'Email invalid'),
  preferred_channel: z.enum(contactChannels).default('whatsapp'),
  is_primary: z.boolean().default(false),
  allow_whatsapp: z.boolean().default(true),
  allow_email: z.boolean().default(true),
  allow_sms: z.boolean().default(false),
  do_not_contact: z.boolean().default(false),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const contactUpdateSchema = contactCreateSchema.extend({ id: idSchema });

export type ContactCreate = z.infer<typeof contactCreateSchema>;
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;
export type ContactRole = (typeof contactRoles)[number];
export type ContactChannel = (typeof contactChannels)[number];

export interface Contact {
  id: number;
  association_id: number;
  name: string;
  role: ContactRole;
  phone: string | null;
  email: string | null;
  preferred_channel: ContactChannel;
  is_primary: boolean;
  allow_whatsapp: boolean;
  allow_email: boolean;
  allow_sms: boolean;
  do_not_contact: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
