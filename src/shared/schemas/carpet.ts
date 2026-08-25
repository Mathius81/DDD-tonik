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

export const carpetOrderCreateSchema = z.object({
  client_id: idSchema,
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

export const carpetOrderUpdateSchema = carpetOrderCreateSchema.extend({ id: idSchema });

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
