import { z } from 'zod';
import { reminderRulesSchema, defaultReminderRules } from './reminder';
import { idSchema } from './common';
import { templateVariables } from './message';

export const companySettingsSchema = z.object({
  name: z.string().trim().max(200).default(''),
  tax_id: z.string().trim().max(20).default(''),
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(30).default(''),
  email: z.string().trim().max(200).default(''),
  website: z.string().trim().max(200).default(''),
});

export const appSettingsSchema = z.object({
  close_to_tray: z.boolean().default(true),
  launch_at_startup: z.boolean().default(false),
});

export const backupSettingsSchema = z.object({
  auto_backup: z.boolean().default(true),
  keep_last: z.number().int().min(1).max(365).default(30),
  /** Folder ales de utilizator prin dialog nativ; null = folderul implicit din userData. */
  custom_folder: z.string().nullable().default(null),
});

export const smtpSettingsSchema = z.object({
  host: z.string().trim().max(200).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().trim().max(200).default(''),
  /** Parola NU e aici — e criptată cu safeStorage, separat. Flag-ul indică existența ei. */
  has_password: z.boolean().default(false),
  from_name: z.string().trim().max(200).default(''),
  from_email: z.string().trim().max(200).default(''),
});

export const whatsappSettingsSchema = z.object({
  mode: z.enum(['disabled', 'assisted', 'cloud_api']).default('assisted'),
  phone_number_id: z.string().trim().max(100).default(''),
  business_account_id: z.string().trim().max(100).default(''),
  /** Token-ul NU e aici — criptat cu safeStorage. */
  has_access_token: z.boolean().default(false),
  /**
   * @deprecated Înlocuit de maparea per-template din `whatsapp_template_map`
   * (vezi `whatsappTemplateMapSchema` mai jos). Rămân în schemă doar pentru
   * compatibilitate cu setările deja salvate; nu mai sunt citite de trimitere.
   */
  template_name: z.string().trim().max(200).default(''),
  template_language: z.string().trim().max(10).default('ro'),
});

/** Un destinatar al raportului zilnic, cu comutator individual. */
export const digestRecipientSchema = z.object({
  email: z.string().trim().max(200),
  active: z.boolean().default(true),
});

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Spațiile de lucru care au propriul raport zilnic. */
export const reportWorkspaces = ['ddd', 'covoare', 'cauciucuri'] as const;
export type ReportWorkspace = (typeof reportWorkspaces)[number];

/** Momentul zilei: dimineața (planul zilei de azi) sau seara (pregătire pentru mâine). */
export const reportPeriods = ['dimineata', 'seara'] as const;
export type ReportPeriod = (typeof reportPeriods)[number];

/** Cele 6 rapoarte independente: câte unul pentru fiecare (spațiu, moment). */
export const reportIds = reportWorkspaces.flatMap((w) =>
  reportPeriods.map((p) => `${w}_${p}` as const),
);
export type ReportId = (typeof reportIds)[number];

/** Canalele prin care poate fi trimis un raport; fiecare raport le poate combina liber. */
export const dailyReportChannelsSchema = z.object({
  email: z.boolean().default(true),
  whatsapp: z.boolean().default(false),
  /** Notificare desktop, cu click pentru navigare/deschidere conversație. */
  notification: z.boolean().default(false),
});
export type DailyReportChannels = z.infer<typeof dailyReportChannelsSchema>;

/** Configurația unui singur raport (ex.: „covoare_seara”): oră proprie, canale proprii. */
export const dailyReportSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  send_at: timeOfDaySchema.default('08:00'),
  channels: dailyReportChannelsSchema.default(dailyReportChannelsSchema.parse({})),
  /** Destinatarii pe email; raportul pleacă doar către cei activi. */
  recipients: z.array(digestRecipientSchema).max(20).default([]),
});
export type DailyReportSettings = z.infer<typeof dailyReportSettingsSchema>;

function defaultReportSettings(sendAt: string): DailyReportSettings {
  return dailyReportSettingsSchema.parse({ send_at: sendAt });
}

/** Cele 6 rapoarte, cu ore implicite diferite pentru dimineață/seară. */
const dailyReportsShape = z.object({
  ddd_dimineata: dailyReportSettingsSchema.default(defaultReportSettings('08:00')),
  ddd_seara: dailyReportSettingsSchema.default(defaultReportSettings('18:00')),
  covoare_dimineata: dailyReportSettingsSchema.default(defaultReportSettings('08:00')),
  covoare_seara: dailyReportSettingsSchema.default(defaultReportSettings('18:00')),
  cauciucuri_dimineata: dailyReportSettingsSchema.default(defaultReportSettings('08:00')),
  cauciucuri_seara: dailyReportSettingsSchema.default(defaultReportSettings('18:00')),
});
export const dailyReportsSchema = dailyReportsShape.default(dailyReportsShape.parse({}));
export type DailyReports = z.infer<typeof dailyReportsSchema>;

/**
 * Raportul zilnic „planul zilei”. Câmpurile `enabled`/`recipients`/`email`/`send_at` de mai
 * jos sunt cele VECHI (un singur raport, doar email, doar dimineața) — rămân în schemă doar
 * pentru compatibilitate; la citire sunt migrate automat în `reports.ddd_dimineata`
 * (vezi `settings.repo.ts`) și nu mai sunt folosite direct de trimitere.
 */
export const dailyDigestSettingsSchema = z.object({
  /** @deprecated migrat în `reports.ddd_dimineata.enabled` */
  enabled: z.boolean().default(false),
  /** @deprecated migrat în `reports.ddd_dimineata.recipients` */
  recipients: z.array(digestRecipientSchema).max(20).default([]),
  /** @deprecated câmp vechi (un singur email) — migrat automat în `recipients` la citire. */
  email: z.string().trim().max(200).default(''),
  /** @deprecated migrat în `reports.ddd_dimineata.send_at` */
  send_at: timeOfDaySchema.default('08:00'),
  /**
   * Flag intern (nu se afișează în UI): devine `true` prima dată când setările vechi de mai
   * sus au fost copiate în `reports.ddd_dimineata`, pentru ca migrarea să ruleze o singură
   * dată și să nu suprascrie editările ulterioare ale utilizatorului.
   */
  legacy_migrated: z.boolean().default(false),
  /** Numărul de WhatsApp al proprietarului, folosit de toate rapoartele cu canalul WhatsApp activ. */
  owner_whatsapp_phone: z.string().trim().max(30).default(''),
  /** Cele 6 rapoarte independente (spațiu × moment al zilei). */
  reports: dailyReportsSchema,
});

export const settingsSchema = z.object({
  company: companySettingsSchema.default(companySettingsSchema.parse({})),
  app: appSettingsSchema.default(appSettingsSchema.parse({})),
  backup: backupSettingsSchema.default(backupSettingsSchema.parse({})),
  smtp: smtpSettingsSchema.default(smtpSettingsSchema.parse({})),
  whatsapp: whatsappSettingsSchema.default(whatsappSettingsSchema.parse({})),
  reminder_rules: reminderRulesSchema.default(defaultReminderRules),
  daily_digest: dailyDigestSettingsSchema.default(dailyDigestSettingsSchema.parse({})),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type BackupSettings = z.infer<typeof backupSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type WhatsappSettings = z.infer<typeof whatsappSettingsSchema>;
export type DigestRecipient = z.infer<typeof digestRecipientSchema>;
export type DailyDigestSettings = z.infer<typeof dailyDigestSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

/** Secrete scrise doar dinspre renderer spre main, niciodată citite înapoi. */
export const setSecretSchema = z.object({
  key: z.enum(['smtp_password', 'whatsapp_access_token']),
  value: z.string().max(2000),
});

/**
 * Mapare: un template local WhatsApp (message_templates.id) → un template aprobat
 * pe Meta, cu limba lui și lista ORDONATĂ de variabile locale care completează
 * pozițiile {{1}}, {{2}}... din template-ul Meta. Folosită automat ca fallback când
 * fereastra de 24h de conversație s-a închis (eroarea Meta 131047) și textul liber
 * nu mai poate fi trimis (spec Cloud API).
 */
export const whatsappTemplateMapUpsertSchema = z.object({
  message_template_id: idSchema,
  meta_template_name: z
    .string()
    .trim()
    .min(1, 'Numele template-ului aprobat de Meta este obligatoriu')
    .max(200),
  language: z.string().trim().min(2, 'Codul de limbă este obligatoriu').max(10).default('ro'),
  variables: z.array(z.enum(templateVariables)).max(10).default([]),
});
export type WhatsappTemplateMapUpsert = z.infer<typeof whatsappTemplateMapUpsertSchema>;

export const whatsappTemplateMapDeleteSchema = z.object({ id: idSchema });

/** Rândul complet, așa cum e citit din DB (id + timestamps în plus față de upsert). */
export interface WhatsappTemplateMap {
  id: number;
  message_template_id: number;
  meta_template_name: string;
  language: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}
