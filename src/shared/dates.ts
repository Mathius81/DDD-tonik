/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { addMonths, addDays, differenceInCalendarDays, format, parse, isValid } from 'date-fns';
import { toIsoDate } from './schemas/common';

/**
 * Adaugă luni calendaristice cu limitare la sfârșit de lună:
 * 2026-01-31 + 1 lună → 2026-02-28 (sau 29 în an bisect).
 * Primește și întoarce date în format ISO 'YYYY-MM-DD'.
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  const d = parseIso(isoDate);
  return toIsoDate(addMonths(d, months));
}

/** Adaugă (sau scade, dacă `days` e negativ) zile calendaristice la o dată ISO. */
export function addDaysIso(isoDate: string, days: number): string {
  return toIsoDate(addDays(parseIso(isoDate), days));
}

export function parseIso(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Dată invalidă: ${isoDate}`);
  return d;
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' pentru afișare. */
export function formatRo(isoDate: string): string {
  return format(parseIso(isoDate), 'dd.MM.yyyy');
}

/** 'DD.MM.YYYY' → 'YYYY-MM-DD'; aruncă eroare pentru date invalide. */
export function parseRo(roDate: string): string {
  const d = parse(roDate, 'dd.MM.yyyy', new Date());
  if (!isValid(d)) throw new Error(`Dată invalidă: ${roDate}`);
  return toIsoDate(d);
}

/** Zile calendaristice de la `fromIso` până la `toIso` (negativ dacă e în trecut). */
export function daysBetween(fromIso: string, toIso: string): number {
  return differenceInCalendarDays(parseIso(toIso), parseIso(fromIso));
}

export function todayIso(now: () => Date = () => new Date()): string {
  return toIsoDate(now());
}

export { toIsoDate };
