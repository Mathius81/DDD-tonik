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
