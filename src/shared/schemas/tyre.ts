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
import { idSchema, isoDateSchema, timeSchema } from './common';

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

// ---------- Programări ----------

/** Listă scurtă, editabilă direct din UI (Autocomplete) — nu blochează alte valori. */
export const tyreAppointmentWorkTypes = [
  'schimb_sezon',
  'montaj',
  'echilibrare',
  'vulcanizare',
  'altele',
] as const;
export type TyreAppointmentWorkType = (typeof tyreAppointmentWorkTypes)[number];

export const tyreAppointmentWorkTypeLabels: Record<TyreAppointmentWorkType, string> = {
  schimb_sezon: 'Schimb sezon',
  montaj: 'Montaj',
  echilibrare: 'Echilibrare',
  vulcanizare: 'Vulcanizare',
  altele: 'Altele',
};

export const tyreAppointmentStatuses = ['programat', 'venit', 'finalizat', 'anulat'] as const;
export type TyreAppointmentStatus = (typeof tyreAppointmentStatuses)[number];

export const tyreAppointmentStatusLabels: Record<TyreAppointmentStatus, string> = {
  programat: 'Programat',
  venit: 'Venit',
  finalizat: 'Finalizat',
  anulat: 'Anulat',
};

export const tyreAppointmentCreateSchema = z.object({
  vehicle_id: idSchema,
  appointment_date: isoDateSchema,
  appointment_time: timeSchema,
  // Text liber — UI oferă sugestiile de mai sus, dar nu blocăm alte tipuri de lucrare.
  work_type: z.string().trim().min(1, 'Tipul lucrării este obligatoriu').max(60),
  season: z
    .enum(tyreSeasons)
    .nullish()
    .transform((v) => v ?? null),
  notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
});

export const tyreAppointmentUpdateSchema = tyreAppointmentCreateSchema.extend({ id: idSchema });

export const tyreAppointmentSetStatusSchema = z.object({
  id: idSchema,
  status: z.enum(tyreAppointmentStatuses),
});

export const tyreAppointmentListFilterSchema = z.object({
  // O singură zi (folosit de vederea „azi” / zi selectată din listă).
  date: isoDateSchema.optional(),
  date_from: isoDateSchema.optional(),
  date_to: isoDateSchema.optional(),
  status: z.enum([...tyreAppointmentStatuses, 'all'] as const).default('all'),
  vehicle_id: idSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
});

export type TyreAppointmentCreate = z.infer<typeof tyreAppointmentCreateSchema>;
export type TyreAppointmentUpdate = z.infer<typeof tyreAppointmentUpdateSchema>;
export type TyreAppointmentSetStatus = z.infer<typeof tyreAppointmentSetStatusSchema>;
export type TyreAppointmentListFilter = z.infer<typeof tyreAppointmentListFilterSchema>;

export interface TyreAppointment {
  id: number;
  vehicle_id: number;
  appointment_date: string;
  appointment_time: string;
  work_type: string;
  season: TyreSeason | null;
  status: TyreAppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în lista de programări, cu mașina + clientul alăturate. */
export interface TyreAppointmentListItem extends TyreAppointment {
  plate_number: string;
  client_id: number;
  client_name: string;
  client_phone: string | null;
  /** Dacă schimbul a fost deja înregistrat pentru această programare (vezi tyre_swaps.appointment_id). */
  swap_id: number | null;
}

// ---------- Schimb de sezon ----------

export const tyreSwapMountedSources = ['adus_de_client', 'din_depozit'] as const;
export type TyreSwapMountedSource = (typeof tyreSwapMountedSources)[number];

export const tyreSwapMountedSourceLabels: Record<TyreSwapMountedSource, string> = {
  adus_de_client: 'Adus de client',
  din_depozit: 'Din depozit (hotel)',
};

export const tyreSwapRemovedDispositions = ['acasa', 'depozit'] as const;
export type TyreSwapRemovedDisposition = (typeof tyreSwapRemovedDispositions)[number];

export const tyreSwapRemovedDispositionLabels: Record<TyreSwapRemovedDisposition, string> = {
  acasa: 'Rămâne acasă la client',
  depozit: 'Intră în depozit (hotel)',
};

/**
 * Înregistrarea unui schimb de sezon. Cele două seturi implicate sunt independente:
 * cel montat acum vine `adus_de_client` sau `din_depozit` (necesită `mounted_storage_id`),
 * iar cel demontat acum rămâne `acasa` sau intră `depozit` (necesită detaliile noului rând:
 * `removed_size`/`removed_brand`/`removed_quantity`).
 */
export const tyreSwapCreateSchema = z
  .object({
    vehicle_id: idSchema,
    appointment_id: idSchema.nullish().transform((v) => v ?? null),
    swap_date: isoDateSchema,
    to_season: z.enum(tyreSeasons),
    mounted_source: z.enum(tyreSwapMountedSources),
    mounted_storage_id: idSchema.nullish().transform((v) => v ?? null),
    removed_disposition: z.enum(tyreSwapRemovedDispositions),
    removed_size: z.string().trim().max(40).nullish().transform((v) => v || null),
    removed_brand: z.string().trim().max(60).nullish().transform((v) => v || null),
    removed_quantity: z
      .number()
      .int()
      .min(1)
      .max(20)
      .nullish()
      .transform((v) => v ?? 4),
    notes: z.string().trim().max(2000).nullish().transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    if (d.mounted_source === 'din_depozit' && !d.mounted_storage_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Alege setul din depozit care se montează.',
        path: ['mounted_storage_id'],
      });
    }
    if (d.removed_disposition === 'depozit' && !d.removed_size) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dimensiunea este obligatorie pentru setul care intră în depozit.',
        path: ['removed_size'],
      });
    }
  });

export type TyreSwapCreate = z.infer<typeof tyreSwapCreateSchema>;

export const tyreSwapListFilterSchema = z.object({
  vehicle_id: idSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type TyreSwapListFilter = z.infer<typeof tyreSwapListFilterSchema>;

export interface TyreSwap {
  id: number;
  vehicle_id: number;
  appointment_id: number | null;
  swap_date: string;
  to_season: TyreSeason;
  mounted_source: TyreSwapMountedSource;
  mounted_storage_id: number | null;
  removed_disposition: TyreSwapRemovedDisposition;
  removed_storage_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Rând în istoricul schimburilor, cu mașina + clientul alăturate. */
export interface TyreSwapListItem extends TyreSwap {
  plate_number: string;
  client_id: number;
  client_name: string;
  client_phone: string | null;
}

// ---------- WhatsApp ----------

export const tyreWhatsappSendSchema = z.object({
  client_id: idSchema,
  message: z.string().trim().min(1, 'Mesajul este gol').max(1000),
  // Opționale — folosite pentru a marca în istoric mesajele trimise ca remindere automate
  // de sezon (vs. mesaje manuale trimise dintr-o fișă de client). Implicit: manual.
  source: z.enum(['manual', 'season_reminder'] as const).default('manual'),
  season: z
    .enum(tyreSeasons)
    .nullish()
    .transform((v) => v ?? null),
});

export type TyreWhatsappSend = z.infer<typeof tyreWhatsappSendSchema>;

// ---------- Istoric mesaje ----------

export const tyreMessageLogSources = ['manual', 'season_reminder'] as const;
export type TyreMessageLogSource = (typeof tyreMessageLogSources)[number];

export const tyreMessageLogSourceLabels: Record<TyreMessageLogSource, string> = {
  manual: 'Manual',
  season_reminder: 'Reminder sezon',
};

export const tyreMessageLogStatuses = ['prepared', 'sent', 'failed'] as const;
export type TyreMessageLogStatus = (typeof tyreMessageLogStatuses)[number];

export interface TyreMessageLog {
  id: number;
  client_id: number;
  channel: 'whatsapp';
  source: TyreMessageLogSource;
  season: TyreSeason | null;
  /** Cheia stabilă a ferestrei de sezon (ex. `iarna-2026`) — vezi `tyreSeasonKey`. `null` pentru mesajele manuale fără sezon. */
  season_key: string | null;
  recipient: string | null;
  message_preview: string;
  status: TyreMessageLogStatus;
  /** Mesajul de eroare al încercării eșuate (doar pentru `status = 'failed'`), sau `null`. */
  error_message: string | null;
  created_at: string;
}

/** Rând în istoricul de mesaje, cu clientul alăturat. */
export interface TyreMessageLogListItem extends TyreMessageLog {
  client_name: string;
}

export const tyreMessageLogListFilterSchema = z.object({
  client_id: idSchema.optional(),
  source: z.enum([...tyreMessageLogSources, 'all'] as const).default('all'),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type TyreMessageLogListFilter = z.infer<typeof tyreMessageLogListFilterSchema>;

// ---------- Remindere de sezon ----------

const monthDaySchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});
export type TyreMonthDay = z.infer<typeof monthDaySchema>;

const tyreSeasonWindowSchema = z.object({
  start: monthDaySchema,
  end: monthDaySchema,
});
export type TyreSeasonWindow = z.infer<typeof tyreSeasonWindowSchema>;

/**
 * Setările reminder-elor automate de sezon (stocate separat de `settingsSchema`, prin
 * `settings.getRaw`/`setRaw` — vezi `tyre-season-reminder.service.ts`). Ferestrele sunt
 * doar lună+zi (se repetă în fiecare an); acceptă și ferestre care trec peste anul nou
 * (ex. 1 dec - 31 ian).
 */
export const tyreSeasonReminderSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  windows: z.object({
    iarna: tyreSeasonWindowSchema,
    vara: tyreSeasonWindowSchema,
  }),
  message_template: z
    .string()
    .trim()
    .min(1, 'Mesajul este gol')
    .max(1000),
});
export type TyreSeasonReminderSettings = z.infer<typeof tyreSeasonReminderSettingsSchema>;

export const defaultTyreSeasonReminderSettings: TyreSeasonReminderSettings = {
  enabled: false,
  windows: {
    iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
    vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
  },
  message_template:
    'Bună ziua, {nume}! Este momentul schimbului de cauciucuri de {sezon}. ' +
    'Sunați-ne sau treceți pe la noi ca să vă programăm. Mulțumim!',
};

/** Înlocuiește token-urile `{nume}`/`{sezon}` din șablonul de mesaj. */
export function renderTyreSeasonReminderMessage(
  template: string,
  vars: { name: string; season: TyreSeason },
): string {
  return template
    .replace(/\{nume\}/g, vars.name)
    .replace(/\{sezon\}/g, tyreSeasonLabels[vars.season].toLowerCase());
}

/**
 * Anul calendaristic în care a pornit fereastra curentă a sezonului `season`, la data
 * `today` (gestionează și ferestre ce trec peste anul nou, ex. 1 dec - 31 ian).
 * Folosită pentru `tyreSeasonKey` — NU mai e folosită direct ca prag de comparare cu
 * `created_at` (vezi motivul la `tyreSeasonKey`).
 */
export function seasonWindowStartYear(window: TyreSeasonWindow, today: Date): number {
  const year = today.getFullYear();
  const startMD = window.start.month * 100 + window.start.day;
  const endMD = window.end.month * 100 + window.end.day;
  const todayMD = (today.getMonth() + 1) * 100 + today.getDate();
  return startMD > endMD && todayMD <= endMD ? year - 1 : year;
}

/**
 * Cheie stabilă a ferestrei de sezon curente — ex. `iarna-2026`. Combină sezonul cu anul
 * calendaristic în care a pornit fereastra, NU cu data exactă de start/sfârșit (care se
 * poate modifica din Setări în mijlocul sezonului). Garda anti-spam
 * (`TyreMessageLogRepository.hasBeenNotified`) se bazează pe EGALITATEA acestei chei, nu
 * pe compararea datei de trimitere cu începutul ferestrei — altfel, ajustarea datelor
 * ferestrei (ex. proprietarul mută începutul iernii din 1 oct în 20 oct, pe 25 oct) ar
 * face ca toate mesajele trimise între cele două date să pice sub noul prag și garda i-ar
 * considera pe toți clienții „netrimiși” din nou → retrimitere în masă la următorul tick.
 */
export function tyreSeasonKey(season: TyreSeason, window: TyreSeasonWindow, today: Date): string {
  return `${season}-${seasonWindowStartYear(window, today)}`;
}

export type TyreSeasonReminderEligibleReason = 'storage' | 'past_swap';

export interface TyreSeasonReminderEligibleClient {
  client_id: number;
  client_name: string;
  client_phone: string | null;
  season: TyreSeason;
  reason: TyreSeasonReminderEligibleReason;
  already_sent: boolean;
  /** Câte încercări AUTOMATE (mod cloud_api) au eșuat pentru acest client, în fereastra curentă. */
  failed_attempts: number;
  /** Mesajul ultimei încercări eșuate, sau `null` — afișat operatorului (nu doar în loguri). */
  last_error: string | null;
}

export interface TyreSeasonReminderStatus {
  settings: TyreSeasonReminderSettings;
  /** Sezonul pentru care fereastra e activă AZI, sau `null` dacă nu suntem în nicio fereastră. */
  activeWindow: TyreSeason | null;
  eligible: TyreSeasonReminderEligibleClient[];
}

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

/** O programare de azi, încă neprocesată (nu finalizată, nu anulată). */
export interface TyreTodoItem {
  appointment_id: number;
  plate_number: string;
  client_name: string;
  appointment_time: string;
}

export interface TyreTodoSummary {
  badge: number;
  items: TyreTodoItem[];
}
