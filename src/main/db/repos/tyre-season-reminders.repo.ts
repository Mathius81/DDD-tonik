/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { Db } from '../database';
import type { TyreSeason, TyreSeasonReminderEligibleClient } from '../../../shared/schemas/tyre';

interface EligibleRow {
  client_id: number;
  client_name: string;
  client_phone: string | null;
  reason: 'storage' | 'past_swap';
}

/**
 * Determină clienții eligibili pentru reminder-ul de sezon — separat de gardă (vezi
 * `TyreMessageLogRepository.hasBeenNotified`), care decide dacă a fost deja trimis.
 */
export class TyreSeasonReminderRepository {
  constructor(private db: Db) {}

  /**
   * Clienți eligibili pentru reminder-ul sezonului `season` (sezonul care tocmai începe
   * fereastra de schimb): cei cu un set din acel sezon aflat acum în depozit (motiv
   * `storage`) și cei al căror ultim schimb înregistrat a fost spre sezonul opus (motiv
   * `past_swap` — probabil e vremea să facă schimbul înapoi). Un client apare o singură
   * dată, cu motivul `storage` preferat dacă se potrivesc ambele.
   */
  listEligibleClients(
    season: TyreSeason,
  ): Omit<TyreSeasonReminderEligibleClient, 'already_sent' | 'failed_attempts' | 'last_error'>[] {
    const opposite: TyreSeason = season === 'vara' ? 'iarna' : 'vara';

    const rows = this.db.all<EligibleRow>(
      `SELECT c.id AS client_id, c.name AS client_name, c.phone AS client_phone, 'storage' AS reason
         FROM tyre_storage_sets s
         JOIN tyre_vehicles v ON v.id = s.vehicle_id
         JOIN tyre_clients c ON c.id = v.client_id
        WHERE s.status = 'in_depozit' AND s.season = ?
       UNION ALL
       SELECT c.id AS client_id, c.name AS client_name, c.phone AS client_phone, 'past_swap' AS reason
         FROM tyre_swaps sw
         JOIN tyre_vehicles v ON v.id = sw.vehicle_id
         JOIN tyre_clients c ON c.id = v.client_id
        WHERE sw.to_season = ?
          AND sw.id = (SELECT MAX(id) FROM tyre_swaps sw2 WHERE sw2.vehicle_id = sw.vehicle_id)`,
      season,
      opposite,
    );

    const byClient = new Map<
      number,
      Omit<TyreSeasonReminderEligibleClient, 'already_sent' | 'failed_attempts' | 'last_error'>
    >();
    for (const row of rows) {
      if (byClient.has(row.client_id)) continue; // 'storage' apare primul — motiv preferat.
      byClient.set(row.client_id, {
        client_id: row.client_id,
        client_name: row.client_name,
        client_phone: row.client_phone,
        season,
        reason: row.reason,
      });
    }
    return [...byClient.values()];
  }
}
