import { z } from 'zod';
import { idSchema } from './common';

export const messageChannels = ['whatsapp', 'email', 'sms'] as const;
export type MessageChannel = (typeof messageChannels)[number];

export const messageStatuses = [
  'prepared', // WhatsApp asistat: mesaj generat, conversație deschisă
  'opened', // WhatsApp asistat: utilizatorul a deschis WhatsApp
  'confirmed_sent', // utilizatorul a confirmat manual trimiterea
  'accepted_by_provider', // Cloud API / SMTP au acceptat mesajul
  'failed',
] as const;
export type MessageStatus = (typeof messageStatuses)[number];

export const messageStatusLabels: Record<MessageStatus, string> = {
  prepared: 'Pregătit',
  opened: 'Deschis în WhatsApp',
  confirmed_sent: 'Trimis (confirmat)',
  accepted_by_provider: 'Trimis',
  failed: 'Eșuat',
};

export const templateChannels = ['whatsapp', 'email'] as const;

export const messageTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, 'Denumirea este obligatorie').max(100),
  channel: z.enum(templateChannels),
  subject: z.string().trim().max(200).nullish().transform((v) => v || null),
  body: z.string().trim().min(1, 'Conținutul este obligatoriu').max(5000),
});

export const messageTemplateUpdateSchema = messageTemplateCreateSchema.extend({
  id: idSchema,
  active: z.boolean(),
});

export type MessageTemplateCreate = z.infer<typeof messageTemplateCreateSchema>;
export type MessageTemplateUpdate = z.infer<typeof messageTemplateUpdateSchema>;

export interface MessageTemplate {
  id: number;
  name: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Cerere din renderer: trimite/pregătește un mesaj pentru un contact + followup. */
export const sendMessageSchema = z.object({
  contact_id: idSchema,
  followup_id: idSchema.nullish().transform((v) => v ?? null),
  reminder_id: idSchema.nullish().transform((v) => v ?? null),
  channel: z.enum(messageChannels),
  template_id: idSchema.nullish().transform((v) => v ?? null),
  /** Corp editat manual de utilizator; dacă lipsește se folosește template-ul. */
  body_override: z.string().trim().max(5000).nullish().transform((v) => v || null),
});

export const markMessageSentSchema = z.object({ id: idSchema });

export const messageLogFilterSchema = z.object({
  association_id: idSchema.optional(),
  status: z.enum([...messageStatuses, 'all'] as const).default('all'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MessageLogFilter = z.infer<typeof messageLogFilterSchema>;

export interface MessageLog {
  id: number;
  association_id: number | null;
  contact_id: number | null;
  followup_id: number | null;
  reminder_id: number | null;
  channel: MessageChannel;
  recipient: string;
  template_id: number | null;
  message_preview: string;
  provider_message_id: string | null;
  status: MessageStatus;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface MessageLogListItem extends MessageLog {
  association_name: string | null;
  contact_name: string | null;
}

/** Variabilele suportate în template-uri. */
export const templateVariables = [
  'contact_name',
  'association_name',
  'service_name',
  'due_date',
  'days_remaining',
  'company_name',
  'company_phone',
] as const;
