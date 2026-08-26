/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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

/** Mesaj implicit propus când o comandă e gata de livrat — editabil înainte de trimitere. */
export function defaultReadyWhatsappMessage(clientName: string): string {
  return `Bună ziua, ${clientName}! Covoarele dumneavoastră sunt gata — vă așteptăm pentru ridicare.`;
}

/** Mesaj implicit propus pentru un client de recontactat (n-a mai comandat de un timp). */
export function defaultRevisitWhatsappMessage(clientName: string): string {
  return `Bună ziua, ${clientName}! A trecut un timp de la ultima spălare a covoarelor — vă așteptăm cu drag din nou.`;
}

/** Mesaj implicit generic, propus din fișa clientului. */
export function defaultClientWhatsappMessage(clientName: string): string {
  return `Bună ziua, ${clientName}! Vă contactăm de la spălătoria de covoare.`;
}
