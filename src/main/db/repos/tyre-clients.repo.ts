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
import type {
  TyreClient,
  TyreClientCreate,
  TyreClientUpdate,
  TyreClientListFilter,
  TyreClientListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

export class TyreClientRepository {
  constructor(private db: Db) {}

  list(filter: TyreClientListFilter): Paginated<TyreClientListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      where.push(`(unaccent_ro(c.name) LIKE ? OR c.phone LIKE ?)`);
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, `%${filter.search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM tyre_clients c ${whereSql}`, ...params)?.n ?? 0;

    const rows = this.db.all<TyreClientListItem>(
      `
      SELECT c.*,
        (SELECT COUNT(*) FROM tyre_vehicles v WHERE v.client_id = c.id) AS vehicles_count,
        (SELECT COUNT(*) FROM tyre_storage_sets s
           JOIN tyre_vehicles v ON v.id = s.vehicle_id
           WHERE v.client_id = c.id AND s.status = 'in_depozit') AS sets_in_storage
      FROM tyre_clients c
      ${whereSql}
      ORDER BY c.name COLLATE NOCASE
      LIMIT ? OFFSET ?
      `,
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

  getById(id: number): TyreClient | undefined {
    return this.db.get<TyreClient>('SELECT * FROM tyre_clients WHERE id = ?', id);
  }

  create(data: TyreClientCreate): TyreClient {
    const result = this.db.run(
      `INSERT INTO tyre_clients (name, phone, notes) VALUES (?, ?, ?)`,
      data.name,
      data.phone,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: TyreClientUpdate): TyreClient {
    this.db.run(
      `UPDATE tyre_clients SET name = ?, phone = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      data.name,
      data.phone,
      data.notes,
      data.id,
    );
    return this.getById(data.id)!;
  }
}
