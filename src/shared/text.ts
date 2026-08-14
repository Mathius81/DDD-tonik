/**
 * Utilitare de limbă română: pluralizare, date lungi, context relativ.
 */

/**
 * Pluralizare românească (Brief §6):
 *   pluralRo(1, 'lună', 'luni')  → '1 lună'
 *   pluralRo(2, 'lună', 'luni')  → '2 luni'
 *   pluralRo(20, 'lună', 'luni') → '20 de luni'
 * Regula „de”: n == 0 sau rest la 100 în afara intervalului 1–19.
 */
export function pluralRo(n: number, one: string, few: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return `${n} ${one}`;
  const rest = abs % 100;
  const needsDe = abs === 0 || rest === 0 || rest >= 20;
  return `${n} ${needsDe ? 'de ' : ''}${few}`;
}

const monthsRo = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];
const weekdaysRo = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const weekdaysShortRo = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];

/** 'joi, 14 august 2026' */
export function roLongDate(d: Date): string {
  return `${weekdaysRo[d.getDay()]}, ${d.getDate()} ${monthsRo[d.getMonth()]} ${d.getFullYear()}`;
}

/** '14 august 2026' */
export function roMediumDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${monthsRo[m - 1]} ${y}`;
}

/** 'Lu 17' — pentru timeline-uri. */
export function roShortDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${weekdaysShortRo[d.getDay()]} ${d.getDate()}`;
}

export type DueUrgency = 'overdue' | 'soon' | 'normal';

/**
 * Contextul relativ al unei scadențe (Brief §4):
 *   'în 30 de zile' · 'în 3 zile' · 'astăzi' · 'ieri' · 'restant de 5 zile'
 */
export function dueContext(daysRemaining: number): { label: string; urgency: DueUrgency } {
  if (daysRemaining < 0) {
    const days = -daysRemaining;
    return {
      label: days === 1 ? 'ieri' : `restant de ${pluralRo(days, 'zi', 'zile')}`,
      urgency: 'overdue',
    };
  }
  if (daysRemaining === 0) return { label: 'astăzi', urgency: 'soon' };
  if (daysRemaining === 1) return { label: 'mâine', urgency: 'soon' };
  if (daysRemaining <= 7) return { label: `în ${pluralRo(daysRemaining, 'zi', 'zile')}`, urgency: 'soon' };
  return { label: `în ${pluralRo(daysRemaining, 'zi', 'zile')}`, urgency: 'normal' };
}

/** Normalizare diacritice pentru căutare: 'Ploiești' → 'ploiesti'. */
export function unaccentRo(s: string): string {
  return s
    .toLowerCase()
    .replace(/ă/g, 'a')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/ș|ş/g, 's')
    .replace(/ț|ţ/g, 't');
}
