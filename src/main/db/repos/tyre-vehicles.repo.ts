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
  type TyreVehicleCreate,
  type TyreVehicleUpdate,
  type TyreVehicleListFilter,
  type TyreVehicleListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

const LIST_SELECT = `
  SELECT v.*, c.name AS client_name, c.phone AS client_phone,
    (SELECT COUNT(*) FROM tyre_storage_sets s
       WHERE s.vehicle_id = v.id AND s.status = 'in_depozit') AS sets_in_storage
  FROM tyre_vehicles v
  JOIN tyre_clients c ON c.id = v.client_id
`;

export class TyreVehicleRepository {
  constructor(private db: Db) {}

  getById(id: number): TyreVehicleListItem | undefined {
    return this.db.get<TyreVehicleListItem>(`${LIST_SELECT} WHERE v.id = ?`, id);
  }

  list(filter: TyreVehicleListFilter): Paginated<TyreVehicleListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.client_id) {
      where.push('v.client_id = ?');
      params.push(filter.client_id);
    }
    // Căutare combinată — cea mai folosită funcție (la tejghea, cu clientul în față):
    // număr de înmatriculare (fără spații), nume (fără diacritice) sau telefon.
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
        `SELECT COUNT(*) AS n FROM tyre_vehicles v JOIN tyre_clients c ON c.id = v.client_id ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<TyreVehicleListItem>(
      `${LIST_SELECT} ${whereSql} ORDER BY c.name COLLATE NOCASE, v.plate_number LIMIT ? OFFSET ?`,
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

  count(): number {
    return this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tyre_vehicles')?.n ?? 0;
  }

  /**
   * Creare mașină — cazul obișnuit (fără `client_id`) creează și clientul, în aceeași
   * tranzacție, dintr-un singur formular: utilizatorul nu trebuie să facă doi pași.
   */
  create(data: TyreVehicleCreate): TyreVehicleListItem {
    return this.db.transaction(() => {
      let clientId = data.client_id;
      if (!clientId) {
        const clientResult = this.db.run(
          `INSERT INTO tyre_clients (name, phone) VALUES (?, ?)`,
          data.client_name,
          data.client_phone,
        );
        clientId = Number(clientResult.lastInsertRowid);
      }
      const normalized = normalizePlate(data.plate_number);
      const result = this.db.run(
        `INSERT INTO tyre_vehicles (client_id, plate_number, plate_normalized, make, model, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        clientId,
        data.plate_number,
        normalized,
        data.make,
        data.model,
        data.notes,
      );
      return this.getById(Number(result.lastInsertRowid))!;
    });
  }

  /** Editează mașina și, pe aceeași fișă, numele/telefonul clientului asociat. */
  update(data: TyreVehicleUpdate): TyreVehicleListItem {
    return this.db.transaction(() => {
      const existing = this.db.get<{ client_id: number }>(
        'SELECT client_id FROM tyre_vehicles WHERE id = ?',
        data.id,
      );
      if (!existing) throw new Error(`Mașina #${data.id} nu există.`);

      this.db.run(
        `UPDATE tyre_clients SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`,
        data.client_name,
        data.client_phone,
        existing.client_id,
      );

      const normalized = normalizePlate(data.plate_number);
      this.db.run(
        `UPDATE tyre_vehicles
         SET plate_number = ?, plate_normalized = ?, make = ?, model = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        data.plate_number,
        normalized,
        data.make,
        data.model,
        data.notes,
        data.id,
      );

      return this.getById(data.id)!;
    });
  }
}
