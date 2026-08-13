import { z } from 'zod';
import { reminderRulesSchema, defaultReminderRules } from './reminder';

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
  template_name: z.string().trim().max(200).default(''),
  template_language: z.string().trim().max(10).default('ro'),
});

export const settingsSchema = z.object({
  company: companySettingsSchema.default(companySettingsSchema.parse({})),
  app: appSettingsSchema.default(appSettingsSchema.parse({})),
  backup: backupSettingsSchema.default(backupSettingsSchema.parse({})),
  smtp: smtpSettingsSchema.default(smtpSettingsSchema.parse({})),
  whatsapp: whatsappSettingsSchema.default(whatsappSettingsSchema.parse({})),
  reminder_rules: reminderRulesSchema.default(defaultReminderRules),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type BackupSettings = z.infer<typeof backupSettingsSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type WhatsappSettings = z.infer<typeof whatsappSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;

/** Secrete scrise doar dinspre renderer spre main, niciodată citite înapoi. */
export const setSecretSchema = z.object({
  key: z.enum(['smtp_password', 'whatsapp_access_token']),
  value: z.string().max(2000),
});
