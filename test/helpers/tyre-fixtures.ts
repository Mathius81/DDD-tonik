/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { AppContext } from '../../src/main/app-context';
import { tyreStorageCreateSchema, tyreSwapCreateSchema, tyreVehicleCreateSchema, type TyreSeason } from '../../src/shared/schemas/tyre';

/** Entități reale create prin repo-uri, cu intrări validate ca la IPC. */
export function creeazaMasina(ctx: AppContext, nume: string, telefon: string | null = null, clientId?: number) {
  return ctx.tyreVehicles.create(tyreVehicleCreateSchema.parse({
    client_id: clientId, client_name: nume, client_phone: telefon,
    plate_number: `B ${ctx.db.get<{ n: number }>('SELECT COUNT(*) + 1 AS n FROM tyre_vehicles')!.n} TST`,
  }));
}

export function depuneSet(ctx: AppContext, masinaId: number, sezon: TyreSeason, data = '2026-08-14') {
  return ctx.tyreStorage.create(tyreStorageCreateSchema.parse({
    vehicle_id: masinaId, size: '205/55 R16', season: sezon, date_in: data,
  }));
}

export function inregistreazaSchimb(ctx: AppContext, masinaId: number, sezon: TyreSeason, data: string) {
  return ctx.tyreSwaps.create(tyreSwapCreateSchema.parse({
    vehicle_id: masinaId, swap_date: data, to_season: sezon,
    mounted_source: 'adus_de_client', removed_disposition: 'acasa',
  }));
}
