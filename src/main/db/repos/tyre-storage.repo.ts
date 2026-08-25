import type { Db } from '../database';
import {
  normalizePlate,
  type TyreStorageCreate,
  type TyreStorageUpdate,
  type TyreStorageListFilter,
  type TyreStorageListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

const LIST_SELECT = `
  SELECT s.*, v.plate_number AS plate_number, v.client_id AS client_id,
    c.name AS client_name, c.phone AS client_phone
  FROM tyre_storage_sets s
  JOIN tyre_vehicles v ON v.id = s.vehicle_id
  JOIN tyre_clients c ON c.id = v.client_id
`;

export class TyreStorageRepository {
  constructor(private db: Db) {}

  getById(id: number): TyreStorageListItem | undefined {
    return this.db.get<TyreStorageListItem>(`${LIST_SELECT} WHERE s.id = ?`, id);
  }

  list(filter: TyreStorageListFilter): Paginated<TyreStorageListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.status !== 'all') {
      where.push('s.status = ?');
      params.push(filter.status);
    }
    if (filter.vehicle_id) {
      where.push('s.vehicle_id = ?');
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
        `SELECT COUNT(*) AS n FROM tyre_storage_sets s
         JOIN tyre_vehicles v ON v.id = s.vehicle_id
         JOIN tyre_clients c ON c.id = v.client_id
         ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<TyreStorageListItem>(
      `${LIST_SELECT} ${whereSql} ORDER BY s.date_in DESC, s.id DESC LIMIT ? OFFSET ?`,
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

  countInStorage(): number {
    return (
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM tyre_storage_sets WHERE status = 'in_depozit'`)
        ?.n ?? 0
    );
  }

  countIntakesSince(sinceIso: string): number {
    return (
      this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tyre_storage_sets WHERE date_in >= ?', sinceIso)
        ?.n ?? 0
    );
  }

  /** Seturile aflate acum în depozit, cele intrate mai demult primele (candidați pentru reminder). */
  listInStorage(limit = 20): TyreStorageListItem[] {
    return this.db.all<TyreStorageListItem>(
      `${LIST_SELECT} WHERE s.status = 'in_depozit' ORDER BY s.date_in ASC, s.id ASC LIMIT ?`,
      limit,
    );
  }

  /** Cele mai recente intrări în depozit, indiferent de stare (pentru dashboard). */
  listRecentIntakes(limit = 20): TyreStorageListItem[] {
    return this.db.all<TyreStorageListItem>(
      `${LIST_SELECT} ORDER BY s.date_in DESC, s.id DESC LIMIT ?`,
      limit,
    );
  }

  /** Seturile intrate în depozit la o anumită dată (pentru raportul de seară — recap zilnic). */
  listIntakesOn(dateIso: string, limit = 20): TyreStorageListItem[] {
    return this.db.all<TyreStorageListItem>(
      `${LIST_SELECT} WHERE s.date_in = ? ORDER BY s.id ASC LIMIT ?`,
      dateIso,
      limit,
    );
  }

  create(data: TyreStorageCreate): TyreStorageListItem {
    const result = this.db.run(
      `INSERT INTO tyre_storage_sets (vehicle_id, size, brand, season, quantity, status, date_in, notes)
       VALUES (?, ?, ?, ?, ?, 'in_depozit', ?, ?)`,
      data.vehicle_id,
      data.size,
      data.brand,
      data.season,
      data.quantity,
      data.date_in,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: TyreStorageUpdate): TyreStorageListItem {
    this.db.run(
      `UPDATE tyre_storage_sets
       SET vehicle_id = ?, size = ?, brand = ?, season = ?, quantity = ?, date_in = ?, notes = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      data.vehicle_id,
      data.size,
      data.brand,
      data.season,
      data.quantity,
      data.date_in,
      data.notes,
      data.id,
    );
    return this.getById(data.id)!;
  }

  /** Marchează un set ca ridicat de client, cu data ieșirii. */
  pickup(id: number, dateOut: string): TyreStorageListItem {
    this.db.run(
      `UPDATE tyre_storage_sets SET status = 'ridicat', date_out = ?, updated_at = datetime('now') WHERE id = ?`,
      dateOut,
      id,
    );
    return this.getById(id)!;
  }

  /** Anulează o ridicare marcată din greșeală — setul revine „în depozit”. */
  returnToStorage(id: number): TyreStorageListItem {
    this.db.run(
      `UPDATE tyre_storage_sets SET status = 'in_depozit', date_out = NULL, updated_at = datetime('now') WHERE id = ?`,
      id,
    );
    return this.getById(id)!;
  }
}
