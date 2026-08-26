/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
/** Formatare datelor pentru UI: 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
export function fmtDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/** 'YYYY-MM-DD HH:mm:ss' → 'DD.MM.YYYY HH:mm'. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [date, time] = iso.split(/[T ]/);
  return `${fmtDate(date)}${time ? ` ${time.slice(0, 5)}` : ''}`;
}
