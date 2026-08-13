import { z } from 'zod';

/** Dată calendaristică stocată ca 'YYYY-MM-DD' (fără oră, fără timezone). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Dată invalidă')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00`);
    return !Number.isNaN(d.getTime()) && s === toIsoDate(d);
  }, 'Dată inexistentă în calendar');

/** Oră 'HH:mm'. */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Oră invalidă');

export const idSchema = z.number().int().positive();

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
