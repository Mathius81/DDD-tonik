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
import {
  normalizePlate,
  type TyreSeason,
  type TyreSwapCreate,
  type TyreSwapListFilter,
  type TyreSwapListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

const LIST_SELECT = `
  SELECT sw.*, v.plate_number AS plate_number, v.client_id AS client_id,
    c.name AS client_name, c.phone AS client_phone
  FROM tyre_swaps sw
  JOIN tyre_vehicles v ON v.id = sw.vehicle_id
  JOIN tyre_clients c ON c.id = v.client_id
`;

/** Eroare „vizibilă” — mesajul e afișat direct utilizatorului (vezi UserFacingError în IPC). */
export class TyreSwapValidationError extends Error {}

export class TyreSwapRepository {
  constructor(private db: Db) {}

  getById(id: number): TyreSwapListItem | undefined {
    return this.db.get<TyreSwapListItem>(`${LIST_SELECT} WHERE sw.id = ?`, id);
  }

  list(filter: TyreSwapListFilter): Paginated<TyreSwapListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.vehicle_id) {
      where.push('sw.vehicle_id = ?');
      params.push(filter.vehicle_id);
    }
    if (filter.search) {
      const term = filter.search.trim();
      where.push(`(
        unaccent_ro(c.name) LIKE ? OR
        v.plate_normalized LIKE ? OR
        c.phone LIKE ?
      )`);
      params.push(`%${unaccent(term)}%`, `%${normalizePlate(term)}%`, `%${term}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total =
      this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM tyre_swaps sw
         JOIN tyre_vehicles v ON v.id = sw.vehicle_id
         JOIN tyre_clients c ON c.id = v.client_id
         ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<TyreSwapListItem>(
      `${LIST_SELECT} ${whereSql} ORDER BY sw.swap_date DESC, sw.id DESC LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows,
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /**
   * Înregistrează schimbul, mutând ambele seturi într-o SINGURĂ tranzacție:
   * setul montat iese din depozit (dacă vine `din_depozit`), setul demontat intră
   * în depozit (dacă `removed_disposition === 'depozit'`). Orice eroare pe parcurs
   * face rollback complet — niciuna dintre mutări nu rămâne pe jumătate făcută.
   */
  create(data: TyreSwapCreate): TyreSwapListItem {
    return this.db.transaction(() => {
      let mountedStorageId: number | null = null;
      if (data.mounted_source === 'din_depozit') {
        const set = this.db.get<{ id: number; vehicle_id: number; status: string }>(
          'SELECT id, vehicle_id, status FROM tyre_storage_sets WHERE id = ?',
          data.mounted_storage_id,
        );
        if (!set) {
          throw new TyreSwapValidationError(`Setul din depozit #${data.mounted_storage_id} nu există.`);
        }
        if (set.vehicle_id !== data.vehicle_id) {
          throw new TyreSwapValidationError('Setul ales din depozit aparține altei mașini.');
        }
        if (set.status !== 'in_depozit') {
          throw new TyreSwapValidationError('Setul ales din depozit a fost deja ridicat.');
        }
        this.db.run(
          `UPDATE tyre_storage_sets SET status = 'ridicat', date_out = ?, updated_at = datetime('now') WHERE id = ?`,
          data.swap_date,
          set.id,
        );
        mountedStorageId = set.id;
      }

      let removedStorageId: number | null = null;
      if (data.removed_disposition === 'depozit') {
        // Setul demontat acum e din sezonul opus celui care tocmai se montează.
        const removedSeason: TyreSeason = data.to_season === 'vara' ? 'iarna' : 'vara';
        const result = this.db.run(
          `INSERT INTO tyre_storage_sets (vehicle_id, size, brand, season, quantity, status, date_in, notes)
           VALUES (?, ?, ?, ?, ?, 'in_depozit', ?, ?)`,
          data.vehicle_id,
          data.removed_size,
          data.removed_brand,
          removedSeason,
          data.removed_quantity,
          data.swap_date,
          null,
        );
        removedStorageId = Number(result.lastInsertRowid);
      }

      const result = this.db.run(
        `INSERT INTO tyre_swaps (
           vehicle_id, appointment_id, swap_date, to_season,
           mounted_source, mounted_storage_id, removed_disposition, removed_storage_id, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.vehicle_id,
        data.appointment_id,
        data.swap_date,
        data.to_season,
        data.mounted_source,
        mountedStorageId,
        data.removed_disposition,
        removedStorageId,
        data.notes,
      );
      return this.getById(Number(result.lastInsertRowid))!;
    });
  }
}
