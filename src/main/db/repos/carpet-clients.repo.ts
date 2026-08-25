import type { Db } from '../database';
import type {
  CarpetClient,
  CarpetClientCreate,
  CarpetClientUpdate,
  CarpetClientListFilter,
  CarpetClientListItem,
} from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

export class CarpetClientRepository {
  constructor(private db: Db) {}

  list(filter: CarpetClientListFilter): Paginated<CarpetClientListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      where.push(`(
        unaccent_ro(c.name) LIKE ? OR c.phone LIKE ? OR unaccent_ro(c.address) LIKE ?
      )`);
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, `%${filter.search}%`, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM carpet_clients c ${whereSql}`, ...params)
        ?.n ?? 0;

    const rows = this.db.all<CarpetClientListItem>(
      `
      SELECT c.*,
        (SELECT COUNT(*) FROM carpet_orders o WHERE o.client_id = c.id) AS orders_count,
        (SELECT MAX(o.pickup_date) FROM carpet_orders o WHERE o.client_id = c.id) AS last_order_date
      FROM carpet_clients c
      ${whereSql}
      ORDER BY c.name COLLATE NOCASE
      LIMIT ? OFFSET ?
      `,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows.map((r) => ({ ...r, last_order_date: r.last_order_date ?? null })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  getById(id: number): CarpetClient | undefined {
    return this.db.get<CarpetClient>('SELECT * FROM carpet_clients WHERE id = ?', id);
  }

  create(data: CarpetClientCreate): CarpetClient {
    const result = this.db.run(
      `INSERT INTO carpet_clients (name, phone, address, notes) VALUES (?, ?, ?, ?)`,
      data.name,
      data.phone,
      data.address,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: CarpetClientUpdate): CarpetClient {
    this.db.run(
      `UPDATE carpet_clients
       SET name = ?, phone = ?, address = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      data.name,
      data.phone,
      data.address,
      data.notes,
      data.id,
    );
    return this.getById(data.id)!;
  }
}
