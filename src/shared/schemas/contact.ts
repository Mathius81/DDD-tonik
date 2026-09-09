/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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

// ---------- Administratori cu mai multe asociații ----------
//
// Un administrator care gestionează mai multe asociații e introdus, în modelul actual,
// ca un contact separat pentru fiecare asociație (`contacts.association_id` e singular —
// vezi migrația 001; NU s-a schimbat schema pentru asta). Grupurile de mai jos se
// calculează la interogare, după telefonul normalizat (E.164, fără '+'), nu la scriere:
// zero risc pentru datele existente, zero migrare.

export const administratorPhoneSchema = z.object({
  phone: z.string().trim().min(1, 'Numărul de telefon este obligatoriu'),
});

export const administratorPhonesSchema = z.object({
  phones: z.array(z.string().trim().min(1)).max(200),
});

export const administratorWhatsappSendSchema = z.object({
  phone: z.string().trim().min(1, 'Numărul de telefon este obligatoriu'),
  message: z.string().trim().min(1, 'Mesajul este gol.').max(5000),
});

export type AdministratorPhoneInput = z.infer<typeof administratorPhoneSchema>;
export type AdministratorPhonesInput = z.infer<typeof administratorPhonesSchema>;
export type AdministratorWhatsappSendInput = z.infer<typeof administratorWhatsappSendSchema>;

/** Starea unui singur follow-up deschis, pentru mesajul agregat / lista de administratori. */
export interface AdministratorFollowupStatus {
  service_name: string;
  due_date: string;
  /** true dacă due_date e în trecut față de ziua curentă. */
  overdue: boolean;
}

/** Ultima intervenție efectuată pentru un serviciu al unei asociații (istoric, „ce s-a făcut”). */
export interface AdministratorLastIntervention {
  service_name: string;
  /** Data ultimei intervenții pentru acest (asociație, serviciu) — MAX(performed_date). */
  last_performed_date: string;
}

/** Situația unei asociații din grupul unui administrator. */
export interface AdministratorAssociationSummary {
  association_id: number;
  association_name: string;
  association_active: boolean;
  /** Contactul concret (din ACEASTĂ asociație) care poartă telefonul grupului. */
  contact_id: number;
  /** Follow-up-uri deschise (pending/contacted/scheduled); gol înseamnă „la zi”. */
  open_followups: AdministratorFollowupStatus[];
  /**
   * Ultima intervenție per serviciu (istoric — „ce s-a făcut”), una per serviciu distinct,
   * sortate alfabetic după numele serviciului. Gol pentru o asociație abia introdusă, fără
   * nicio intervenție înregistrată încă.
   */
  last_interventions: AdministratorLastIntervention[];
}

/** Un administrator (identificat după telefon normalizat) cu toate asociațiile lui. */
export interface AdministratorGroup {
  /** Telefon normalizat E.164 fără '+' — cheie stabilă a grupului. */
  phone: string;
  /** Telefonul așa cum a fost scris ultima dată (pentru afișare + wa.me). */
  phone_display: string;
  /** Numele din contactul cel mai recent actualizat. */
  display_name: string;
  /** Toate numele distincte văzute pentru acest telefon (pot diferi ușor între asociații). */
  names: string[];
  associations: AdministratorAssociationSummary[];
  associations_count: number;
  /** Câte asociații au cel puțin un follow-up restant (scadență trecută). */
  overdue_count: number;
  /** Câte asociații au cel puțin un follow-up scadent, dar niciunul restant. */
  upcoming_count: number;
  /** Câte asociații sunt „la zi” (fără follow-up-uri deschise). */
  ok_count: number;
}

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
