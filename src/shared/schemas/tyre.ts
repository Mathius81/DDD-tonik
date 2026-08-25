import { z } from 'zod';
import { idSchema, isoDateSchema } from './common';

/**
 * Spațiul de lucru Cauciucuri (vulcanizare + hotel de cauciucuri).
 * FĂRĂ facturare: acest modul nu are niciun preț, document fiscal sau TVA.
 */

export const tyreSeasons = ['vara', 'iarna'] as const;
export type TyreSeason = (typeof tyreSeasons)[number];

export const tyreSeasonLabels: Record<TyreSeason, string> = {
  vara: 'Vară',
  iarna: 'Iarnă',
};

export const tyreStorageStatuses = ['in_depozit', 'ridicat'] as const;
export type TyreStorageStatus = (typeof tyreStorageStatuses)[number];

export const tyreStorageStatusLabels: Record<TyreStorageStatus, string> = {
  in_depozit: 'În depozit',
  ridicat: 'Ridicat',
};

/** Normalizează un număr de înmatriculare pentru căutare: majuscule, fără spații/liniuțe. */
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[\s-]+/g, '');
}

// ---------- Clienți ----------

export const tyreClientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Numele este obligatoriu').max(200),
  phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const tyreClientUpdateSchema = tyreClientCreateSchema.extend({ id: idSchema });

export const tyreClientListFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type TyreClientCreate = z.infer<typeof tyreClientCreateSchema>;
export type TyreClientUpdate = z.infer<typeof tyreClientUpdateSchema>;
export type TyreClientListFilter = z.infer<typeof tyreClientListFilterSchema>;

export interface TyreClient {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de clienți, cu informații agregate despre mașini/depozit. */
export interface TyreClientListItem extends TyreClient {
  vehicles_count: number;
  sets_in_storage: number;
}

// ---------- Mașini ----------

/** Majuscule + spațiere unică — păstrează numărul lizibil, normalizarea „fără spații” e separată. */
const plateSchema = z
  .string()
  .trim()
  .min(1, 'Numărul de înmatriculare este obligatoriu')
  .max(20, 'Număr de înmatriculare prea lung')
  .transform((v) => v.toUpperCase().replace(/\s+/g, ' ').trim());

/**
 * Creare mașină: fie pentru un client existent (`client_id`), fie — cazul obișnuit —
 * într-un singur pas, cu clientul nou creat automat din `client_name`/`client_phone`.
 */
export const tyreVehicleCreateSchema = z
  .object({
    client_id: idSchema.nullish().transform((v) => v ?? null),
    client_name: z.string().trim().max(200).nullish().transform((v) => v || null),
    client_phone: z.string().trim().max(30).nullish().transform((v) => v || null),
    plate_number: plateSchema,
    make: z.string().trim().max(60).nullish().transform((v) => v || null),
    model: z.string().trim().max(60).nullish().transform((v) => v || null),
    notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
  })
  .refine((d) => d.client_id != null || !!d.client_name, {
    message: 'Alege un client existent sau completează numele noului client.',
    path: ['client_name'],
  });

/** Editare mașină: numele/telefonul se editează direct pe fișă și actualizează clientul asociat. */
export const tyreVehicleUpdateSchema = z.object({
  id: idSchema,
  client_name: z.string().trim().min(1, 'Numele este obligatoriu').max(200),
  client_phone: z.string().trim().max(30).nullish().transform((v) => v || null),
  plate_number: plateSchema,
  make: z.string().trim().max(60).nullish().transform((v) => v || null),
  model: z.string().trim().max(60).nullish().transform((v) => v || null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const tyreVehicleListFilterSchema = z.object({
  client_id: idSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type TyreVehicleCreate = z.infer<typeof tyreVehicleCreateSchema>;
export type TyreVehicleUpdate = z.infer<typeof tyreVehicleUpdateSchema>;
export type TyreVehicleListFilter = z.infer<typeof tyreVehicleListFilterSchema>;

export interface TyreVehicle {
  id: number;
  client_id: number;
  plate_number: string;
  plate_normalized: string;
  make: string | null;
  model: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de mașini, cu clientul alăturat (afișare + căutare combinată). */
export interface TyreVehicleListItem extends TyreVehicle {
  client_name: string;
  client_phone: string | null;
  sets_in_storage: number;
}

// ---------- Depozit (hotel de cauciucuri) ----------

export const tyreStorageCreateSchema = z.object({
  vehicle_id: idSchema,
  size: z.string().trim().min(1, 'Dimensiunea este obligatorie').max(40),
  brand: z.string().trim().max(60).nullish().transform((v) => v || null),
  season: z.enum(tyreSeasons),
  quantity: z.number().int().min(1).max(20).default(4),
  date_in: isoDateSchema,
  // Aici notează utilizatorul poziția pe raft — nu există câmpuri dedicate rând/raft/poziție.
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const tyreStorageUpdateSchema = tyreStorageCreateSchema.extend({ id: idSchema });

export const tyreStoragePickupSchema = z.object({
  id: idSchema,
  date_out: isoDateSchema,
});

export const tyreStorageReturnSchema = z.object({ id: idSchema });

export const tyreStorageListFilterSchema = z.object({
  status: z.enum([...tyreStorageStatuses, 'all'] as const).default('in_depozit'),
  vehicle_id: idSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type TyreStorageCreate = z.infer<typeof tyreStorageCreateSchema>;
export type TyreStorageUpdate = z.infer<typeof tyreStorageUpdateSchema>;
export type TyreStoragePickup = z.infer<typeof tyreStoragePickupSchema>;
export type TyreStorageListFilter = z.infer<typeof tyreStorageListFilterSchema>;

export interface TyreStorageSet {
  id: number;
  vehicle_id: number;
  size: string;
  brand: string | null;
  season: TyreSeason;
  quantity: number;
  status: TyreStorageStatus;
  date_in: string;
  date_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de depozit, cu mașina + clientul alăturate. */
export interface TyreStorageListItem extends TyreStorageSet {
  plate_number: string;
  client_id: number;
  client_name: string;
  client_phone: string | null;
}

// ---------- WhatsApp ----------

export const tyreWhatsappSendSchema = z.object({
  client_id: idSchema,
  message: z.string().trim().min(1, 'Mesajul este gol').max(1000),
});

export type TyreWhatsappSend = z.infer<typeof tyreWhatsappSendSchema>;

// ---------- Dashboard ----------

export interface TyreDashboardCounts {
  sets_in_storage: number;
  vehicles_total: number;
  intakes_last_30_days: number;
}

export interface TyreDashboardData {
  counts: TyreDashboardCounts;
  inStorage: TyreStorageListItem[];
  recentIntakes: TyreStorageListItem[];
}
