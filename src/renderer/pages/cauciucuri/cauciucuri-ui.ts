/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { TyreStorageStatus, TyreSeason } from '../../../shared/schemas/tyre';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** Tonul badge-ului de status pentru un set din depozit. */
export const tyreStorageStatusTone: Record<TyreStorageStatus, Tone> = {
  in_depozit: 'info',
  ridicat: 'success',
};

/** Culoarea Mantine pentru anotimp — dimensiune separată de starea setului. */
export const tyreSeasonColor: Record<TyreSeason, string> = {
  vara: 'orange',
  iarna: 'blue',
};

/** Mesaj implicit propus la trimiterea unui WhatsApp din fișa clientului — editabil înainte de trimitere. */
export function defaultClientWhatsappMessage(clientName: string): string {
  return `Bună ziua, ${clientName}! Este sezonul pentru schimbarea cauciucurilor — vă așteptăm pentru o programare.`;
}

/** Mesaj implicit propus din fișa mașinii (include numărul de înmatriculare). */
export function defaultVehicleWhatsappMessage(clientName: string, plateNumber: string): string {
  return `Bună ziua, ${clientName}! Este sezonul pentru schimbarea cauciucurilor la mașina cu numărul ${plateNumber}. Vă așteptăm pentru o programare.`;
}

/** Mesaj implicit propus din fișa unui set aflat în depozit (reamintește ridicarea/schimbul). */
export function defaultStorageWhatsappMessage(
  clientName: string,
  plateNumber: string,
  size: string,
): string {
  return `Bună ziua, ${clientName}! Cauciucurile ${size} aflate în depozit pentru mașina ${plateNumber} sunt gata pentru schimb — vă așteptăm pentru o programare.`;
}
