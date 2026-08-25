import type { CarpetOrderStatus } from '../../../shared/schemas/carpet';

/** Formatare RO pentru suprafață: 3.5 → '3,5 mp'. */
export function formatMp(n: number): string {
  return `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} mp`;
}

/** Formatare RO pentru totalul informativ (NU e o sumă de facturat). */
export function formatLei(n: number): string {
  return `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} lei`;
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** Tonul badge-ului de status, pe fluxul firesc al unei comenzi (Brief §4). */
export const carpetOrderStatusTone: Record<CarpetOrderStatus, Tone> = {
  preluat: 'neutral',
  in_lucru: 'info',
  gata: 'warning',
  livrat: 'success',
};
