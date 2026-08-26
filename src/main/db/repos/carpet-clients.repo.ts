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
  normalizePhoneRo,
  type CarpetClient,
  type CarpetClientCreate,
  type CarpetClientUpdate,
  type CarpetClientListFilter,
  type CarpetClientListItem,
} from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

export class CarpetClientRepository {
  constructor(private db: Db) {}

  list(filter: CarpetClientListFilter): Paginated<CarpetClientListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      // Telefonul e cheia principală de căutare (numărul e mai important decât numele la
      // tejghea): comparăm pe forma normalizată, ca să funcționeze indiferent de format
      // (0722.../ +40722.../ 0040722...). normalizePhoneRo('') pentru un termen nenumeric
      // dă '' — gărzile `? != ''` evită un LIKE '%%' care ar potrivi orice rând.
      const normalizedTerm = normalizePhoneRo(filter.search);
      where.push(`(
        unaccent_ro(c.name) LIKE ? OR c.phone LIKE ?
        OR (? != '' AND c.phone_normalized LIKE ?)
        OR unaccent_ro(c.address) LIKE ?
      )`);
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, `%${filter.search}%`, normalizedTerm, `%${normalizedTerm}%`, term);
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
      `INSERT INTO carpet_clients (name, phone, phone_normalized, address, notes) VALUES (?, ?, ?, ?, ?)`,
      data.name,
      data.phone,
      data.phone ? normalizePhoneRo(data.phone) || null : null,
      data.address,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: CarpetClientUpdate): CarpetClient {
    this.db.run(
      `UPDATE carpet_clients
       SET name = ?, phone = ?, phone_normalized = ?, address = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      data.name,
      data.phone,
      data.phone ? normalizePhoneRo(data.phone) || null : null,
      data.address,
      data.notes,
      data.id,
    );
    return this.getById(data.id)!;
  }

  /**
   * Clienți „de recontactat": ultima comandă e mai veche decât `cutoffIso` (sau n-au avut
   * nicio comandă încă) — folosit de pagina Remindere pentru „revizitare la N luni".
   * Doar clienți cu cel puțin o comandă anterioară intră aici (fără comenzi = niciodată revizitat).
   */
  listForRevisit(cutoffIso: string, limit = 50): CarpetClientListItem[] {
    return this.db.all<CarpetClientListItem>(
      `
      SELECT c.*,
        (SELECT COUNT(*) FROM carpet_orders o WHERE o.client_id = c.id) AS orders_count,
        (SELECT MAX(o.pickup_date) FROM carpet_orders o WHERE o.client_id = c.id) AS last_order_date
      FROM carpet_clients c
      WHERE EXISTS (SELECT 1 FROM carpet_orders o WHERE o.client_id = c.id)
        AND (SELECT MAX(o.pickup_date) FROM carpet_orders o WHERE o.client_id = c.id) < ?
      ORDER BY last_order_date ASC
      LIMIT ?
      `,
      cutoffIso,
      limit,
    );
  }
}
