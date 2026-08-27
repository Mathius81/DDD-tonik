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
import { idSchema, isoDateSchema } from './common';

/**
 * Spațiul de lucru Covoare (spălare covoare).
 * FĂRĂ facturare: `price_per_sqm` e opțional și doar informativ — nu există
 * niciun document fiscal, serie de factură sau TVA în acest modul.
 */

export const carpetItemTypes = ['covor', 'mocheta', 'carpeta', 'traversa'] as const;
export type CarpetItemType = (typeof carpetItemTypes)[number];

export const carpetItemTypeLabels: Record<CarpetItemType, string> = {
  covor: 'Covor',
  mocheta: 'Mochetă',
  carpeta: 'Carpetă',
  traversa: 'Traversă',
};

export const carpetOrderStatuses = ['preluat', 'in_lucru', 'gata', 'livrat'] as const;
export type CarpetOrderStatus = (typeof carpetOrderStatuses)[number];

export const carpetOrderStatusLabels: Record<CarpetOrderStatus, string> = {
  preluat: 'Preluat',
  in_lucru: 'În lucru',
  gata: 'Gata de livrat',
  livrat: 'Livrat',
};

/**
 * Normalizează un număr de telefon pentru căutare, indiferent de formatul în care a fost
 * introdus: '0722 123 456', '+40722123456' și '0040722123456' devin toate '0722123456'.
 * Telefonul e cheia principală de căutare a unui client în Covoare — vezi CarpetClientRepository.
 */
export function normalizePhoneRo(phone: string): string {
  let digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('0040') && digits.length > 4) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('40') && digits.length > 2) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('00') && digits.length > 2) digits = digits.slice(2);
  return digits;
}

// ---------- Clienți ----------

export const carpetClientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Numele este obligatoriu').max(200),
  phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  address: z.string().trim().max(300).nullish().transform((v) => v || null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const carpetClientUpdateSchema = carpetClientCreateSchema.extend({ id: idSchema });

export const carpetClientListFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type CarpetClientCreate = z.infer<typeof carpetClientCreateSchema>;
export type CarpetClientUpdate = z.infer<typeof carpetClientUpdateSchema>;
export type CarpetClientListFilter = z.infer<typeof carpetClientListFilterSchema>;

export interface CarpetClient {
  id: number;
  name: string;
  phone: string | null;
  /** Telefon normalizat (fără prefix de țară, fără spații) — doar pentru căutare internă. */
  phone_normalized: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de clienți, cu informații agregate despre comenzi. */
export interface CarpetClientListItem extends CarpetClient {
  orders_count: number;
  last_order_date: string | null;
}

// ---------- Comenzi ----------

export const carpetOrderItemInputSchema = z.object({
  type: z.enum(carpetItemTypes),
  length_m: z
    .number()
    .positive('Lungimea trebuie să fie mai mare decât 0')
    .max(100, 'Lungime prea mare'),
  width_m: z
    .number()
    .positive('Lățimea trebuie să fie mai mare decât 0')
    .max(100, 'Lățime prea mare'),
});

const carpetOrderBaseSchema = z.object({
  pickup_date: isoDateSchema,
  due_date: isoDateSchema.nullish().transform((v) => v ?? null),
  status: z.enum(carpetOrderStatuses).default('preluat'),
  // Preț informativ / mp — opțional, NU generează facturare.
  price_per_sqm: z
    .number()
    .nonnegative('Prețul nu poate fi negativ')
    .max(100000)
    .nullish()
    .transform((v) => v ?? null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
  items: z.array(carpetOrderItemInputSchema).min(1, 'Adaugă cel puțin un covor'),
});

/**
 * Creare comandă: fie pentru un client existent (`client_id`), fie — direct de la tejghea —
 * cu clientul nou creat automat, în aceeași tranzacție, din `client_name`/`client_phone`/
 * `client_address`/`client_notes`. Același tipar ca la mașini (vezi `tyreVehicleCreateSchema`).
 */
export const carpetOrderCreateSchema = carpetOrderBaseSchema
  .extend({
    client_id: idSchema.nullish().transform((v) => v ?? null),
    client_name: z.string().trim().max(200).nullish().transform((v) => v || null),
    client_phone: z.string().trim().max(30).nullish().transform((v) => v || null),
    client_address: z.string().trim().max(300).nullish().transform((v) => v || null),
    client_notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
  })
  .refine((d) => d.client_id != null || !!d.client_name, {
    message: 'Alege un client existent sau completează numele noului client.',
    path: ['client_name'],
  });

/** Editare comandă: clientul e mereu unul existent (reasignare posibilă din listă). */
export const carpetOrderUpdateSchema = carpetOrderBaseSchema.extend({
  id: idSchema,
  client_id: idSchema,
});

export const carpetOrderListFilterSchema = z.object({
  client_id: idSchema.optional(),
  status: z.enum([...carpetOrderStatuses, 'all'] as const).default('all'),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const carpetOrderSetStatusSchema = z.object({
  id: idSchema,
  status: z.enum(carpetOrderStatuses),
});

export type CarpetOrderItemInput = z.infer<typeof carpetOrderItemInputSchema>;
export type CarpetOrderCreate = z.infer<typeof carpetOrderCreateSchema>;
export type CarpetOrderUpdate = z.infer<typeof carpetOrderUpdateSchema>;
export type CarpetOrderListFilter = z.infer<typeof carpetOrderListFilterSchema>;
export type CarpetOrderSetStatus = z.infer<typeof carpetOrderSetStatusSchema>;

export interface CarpetOrderItem {
  id: number;
  order_id: number;
  type: CarpetItemType;
  length_m: number;
  width_m: number;
  sqm: number;
  created_at: string;
  updated_at: string;
}

export interface CarpetOrder {
  id: number;
  client_id: number;
  pickup_date: string;
  due_date: string | null;
  status: CarpetOrderStatus;
  price_per_sqm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Comandă cu lista de covoare și totalurile calculate (folosită la creare/editare/detalii). */
export interface CarpetOrderWithItems extends CarpetOrder {
  client_name: string;
  client_phone: string | null;
  items: CarpetOrderItem[];
  total_sqm: number;
  /** Total informativ (mp × preț/mp), sau null dacă nu s-a completat prețul. NU e o factură. */
  total_price: number | null;
}

/** Rând în lista de comenzi. */
export interface CarpetOrderListItem extends CarpetOrder {
  client_name: string;
  client_phone: string | null;
  item_count: number;
  total_sqm: number;
  total_price: number | null;
}

// ---------- Dashboard ----------

export interface CarpetDashboardCounts {
  in_lucru: number;
  gata: number;
  preluate_azi: number;
}

export interface CarpetDashboardData {
  counts: CarpetDashboardCounts;
  readyToDeliver: CarpetOrderListItem[];
  todayPickups: CarpetOrderListItem[];
}

/** O comandă de urmărit azi: gata de livrat sau cu termenul depășit. */
export interface CarpetTodoItem {
  order_id: number;
  client_name: string;
  reason: 'gata' | 'overdue';
  due_date: string | null;
}

export interface CarpetTodoSummary {
  badge: number;
  items: CarpetTodoItem[];
}

// ---------- Calendar ----------

export const carpetCalendarMonthFilterSchema = z.object({
  /** 'YYYY-MM' */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format lună invalid'),
});

export type CarpetCalendarMonthFilter = z.infer<typeof carpetCalendarMonthFilterSchema>;

/** O intrare pe o zi din calendar — o comandă preluată sau cu termen în acea zi. */
export interface CarpetCalendarDayEntry {
  date: string;
  kind: 'pickup' | 'due';
  order_id: number;
  client_name: string;
  status: CarpetOrderStatus;
}

// ---------- Setări ----------

export const carpetSettingsUpdateSchema = z.object({
  // Preț/mp implicit — doar informativ, propus la o comandă nouă; nu generează facturare.
  default_price_per_sqm: z
    .number()
    .nonnegative('Prețul nu poate fi negativ')
    .max(100000)
    .nullish()
    .transform((v) => v ?? null),
  // Termen implicit (zile de la preluare) — doar propus, utilizatorul îl poate schimba oricând.
  default_due_days: z
    .number()
    .int()
    .positive('Numărul de zile trebuie să fie pozitiv')
    .max(365)
    .nullish()
    .transform((v) => v ?? null),
  notify_on_ready: z.boolean(),
  // Reamintește revizitarea la N luni de la ultima comandă a clientului; null = dezactivat.
  revisit_months: z
    .number()
    .int()
    .positive('Numărul de luni trebuie să fie pozitiv')
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
});

export type CarpetSettingsUpdate = z.infer<typeof carpetSettingsUpdateSchema>;

export interface CarpetSettings {
  default_price_per_sqm: number | null;
  default_due_days: number | null;
  notify_on_ready: boolean;
  revisit_months: number | null;
  updated_at: string;
}

// ---------- WhatsApp ----------

export const carpetWhatsappSendSchema = z.object({
  client_id: idSchema,
  message: z.string().trim().min(1, 'Mesajul este gol').max(1000),
});

export type CarpetWhatsappSend = z.infer<typeof carpetWhatsappSendSchema>;

// ---------- Mesaje ----------

export const carpetMessageListFilterSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type CarpetMessageListFilter = z.infer<typeof carpetMessageListFilterSchema>;

/** Rând din jurnalul propriu de mesaje al spațiului Covoare (izolat de `message_logs` din DDD). */
export interface CarpetMessageLogItem {
  id: number;
  client_id: number | null;
  client_name: string | null;
  channel: 'whatsapp';
  recipient: string;
  message_preview: string;
  status: 'prepared';
  created_at: string;
}

// ---------- Remindere ----------

/**
 * Cele două liste simple ale spațiului Covoare: comenzi gata de livrat (de anunțat clientul)
 * și clienți „de recontactat" (n-au mai comandat de `revisit_months` luni). Fără scheduler —
 * doar calcul la cerere, afișat pe pagina Remindere.
 */
export interface CarpetRemindersData {
  settings: CarpetSettings;
  readyToNotify: CarpetOrderListItem[];
  revisitDue: CarpetClientListItem[];
}
