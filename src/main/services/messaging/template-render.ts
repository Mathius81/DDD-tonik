import { formatRo, daysBetween } from '../../../shared/dates';
import type { CompanySettings } from '../../../shared/schemas/settings';

export interface TemplateContext {
  contact_name: string;
  association_name: string;
  service_name: string;
  due_date: string; // ISO; se formatează DD.MM.YYYY la randare
  todayIso: string;
  company: CompanySettings;
}

/** Înlocuiește variabilele {{...}} din template. Variabilele necunoscute rămân goale. */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    contact_name: ctx.contact_name,
    association_name: ctx.association_name,
    service_name: ctx.service_name,
    due_date: formatRo(ctx.due_date),
    days_remaining: String(Math.max(0, daysBetween(ctx.todayIso, ctx.due_date))),
    company_name: ctx.company.name,
    company_phone: ctx.company.phone,
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? '');
}

/**
 * Normalizează un număr de telefon românesc la E.164 pentru WhatsApp.
 * '0712 345 678' → '40712345678'; numerele deja internaționale rămân.
 * Întoarce null dacă numărul nu pare valid.
 */
export function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits.slice(1);
  if (/^00\d{8,15}$/.test(digits)) return digits.slice(2);
  if (/^07\d{8}$/.test(digits)) return `40${digits.slice(1)}` /* 07xxxxxxxx → 407xxxxxxxx */;
  if (/^40\d{9}$/.test(digits)) return digits;
  return null;
}
