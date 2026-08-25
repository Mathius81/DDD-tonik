import type { Db } from '../database';
import type {
  CarpetOrder,
  CarpetOrderCreate,
  CarpetOrderItem,
  CarpetOrderItemInput,
  CarpetOrderListFilter,
  CarpetOrderListItem,
  CarpetOrderStatus,
  CarpetOrderUpdate,
  CarpetOrderWithItems,
} from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

/** Rotunjire la 2 zecimale — evită artefactele de virgulă mobilă (ex. 0.1 + 0.2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Total informativ (mp × preț/mp) — NU e o factură, doar o cifră orientativă. */
function totalPrice(pricePerSqm: number | null, totalSqm: number): number | null {
  return pricePerSqm != null ? round2(totalSqm * pricePerSqm) : null;
}

interface OrderListRow extends CarpetOrder {
  client_name: string;
  client_phone: string | null;
  total_sqm: number;
  item_count: number;
}

const LIST_SELECT = `
  SELECT o.*, c.name AS client_name, c.phone AS client_phone,
    (SELECT COALESCE(SUM(i.sqm), 0) FROM carpet_order_items i WHERE i.order_id = o.id) AS total_sqm,
    (SELECT COUNT(*) FROM carpet_order_items i WHERE i.order_id = o.id) AS item_count
  FROM carpet_orders o
  JOIN carpet_clients c ON c.id = o.client_id
`;

export class CarpetOrderRepository {
  constructor(private db: Db) {}

  getById(id: number): CarpetOrderWithItems | undefined {
    const row = this.db.get<OrderListRow>(`${LIST_SELECT} WHERE o.id = ?`, id);
    if (!row) return undefined;
    const items = this.db.all<CarpetOrderItem>(
      `SELECT * FROM carpet_order_items WHERE order_id = ? ORDER BY id`,
      id,
    );
    return { ...row, items, total_price: totalPrice(row.price_per_sqm, row.total_sqm) };
  }

  list(filter: CarpetOrderListFilter): Paginated<CarpetOrderListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.client_id) {
      where.push('o.client_id = ?');
      params.push(filter.client_id);
    }
    if (filter.status !== 'all') {
      where.push('o.status = ?');
      params.push(filter.status);
    }
    if (filter.search) {
      where.push('(unaccent_ro(c.name) LIKE ? OR c.phone LIKE ?)');
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, `%${filter.search}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total =
      this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM carpet_orders o JOIN carpet_clients c ON c.id = o.client_id ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<OrderListRow>(
      `${LIST_SELECT} ${whereSql} ORDER BY o.pickup_date DESC, o.id DESC LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows.map((r) => ({ ...r, total_price: totalPrice(r.price_per_sqm, r.total_sqm) })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /** Comenzile într-o anumită stare, cele mai recent actualizate primele (pentru dashboard). */
  listByStatus(status: CarpetOrderStatus, limit = 20): CarpetOrderListItem[] {
    const rows = this.db.all<OrderListRow>(
      `${LIST_SELECT} WHERE o.status = ? ORDER BY o.updated_at DESC, o.id DESC LIMIT ?`,
      status,
      limit,
    );
    return rows.map((r) => ({ ...r, total_price: totalPrice(r.price_per_sqm, r.total_sqm) }));
  }

  /** Comenzile preluate la o anumită dată (pentru dashboard: „preluate azi"). */
  listPickedUpOn(dateIso: string, limit = 20): CarpetOrderListItem[] {
    const rows = this.db.all<OrderListRow>(
      `${LIST_SELECT} WHERE o.pickup_date = ? ORDER BY o.id DESC LIMIT ?`,
      dateIso,
      limit,
    );
    return rows.map((r) => ({ ...r, total_price: totalPrice(r.price_per_sqm, r.total_sqm) }));
  }

  /** Comenzile cu termen la o anumită dată, care nu au fost încă livrate (pentru raportul de seară). */
  listDueOn(dateIso: string, limit = 20): CarpetOrderListItem[] {
    const rows = this.db.all<OrderListRow>(
      `${LIST_SELECT} WHERE o.due_date = ? AND o.status != 'livrat' ORDER BY o.id ASC LIMIT ?`,
      dateIso,
      limit,
    );
    return rows.map((r) => ({ ...r, total_price: totalPrice(r.price_per_sqm, r.total_sqm) }));
  }

  countsForDashboard(todayIso: string): {
    in_lucru: number;
    gata: number;
    preluate_azi: number;
  } {
    const countByStatus = (status: CarpetOrderStatus) =>
      this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM carpet_orders WHERE status = ?', status)
        ?.n ?? 0;
    return {
      in_lucru: countByStatus('in_lucru'),
      gata: countByStatus('gata'),
      preluate_azi:
        this.db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM carpet_orders WHERE pickup_date = ?',
          todayIso,
        )?.n ?? 0,
    };
  }

  private insertItems(orderId: number, items: CarpetOrderItemInput[]): void {
    for (const item of items) {
      const sqm = round2(item.length_m * item.width_m);
      this.db.run(
        `INSERT INTO carpet_order_items (order_id, type, length_m, width_m, sqm) VALUES (?, ?, ?, ?, ?)`,
        orderId,
        item.type,
        item.length_m,
        item.width_m,
        sqm,
      );
    }
  }

  create(data: CarpetOrderCreate): CarpetOrderWithItems {
    return this.db.transaction(() => {
      const result = this.db.run(
        `INSERT INTO carpet_orders (client_id, pickup_date, due_date, status, price_per_sqm, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        data.client_id,
        data.pickup_date,
        data.due_date,
        data.status,
        data.price_per_sqm,
        data.notes,
      );
      const orderId = Number(result.lastInsertRowid);
      this.insertItems(orderId, data.items);
      return this.getById(orderId)!;
    });
  }

  update(data: CarpetOrderUpdate): CarpetOrderWithItems {
    return this.db.transaction(() => {
      this.db.run(
        `UPDATE carpet_orders
         SET client_id = ?, pickup_date = ?, due_date = ?, status = ?, price_per_sqm = ?, notes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        data.client_id,
        data.pickup_date,
        data.due_date,
        data.status,
        data.price_per_sqm,
        data.notes,
        data.id,
      );
      // Cea mai simplă strategie corectă pentru o listă mică de covoare pe comandă:
      // înlocuim toate rândurile în aceeași tranzacție (rollback complet la eroare).
      this.db.run(`DELETE FROM carpet_order_items WHERE order_id = ?`, data.id);
      this.insertItems(data.id, data.items);
      return this.getById(data.id)!;
    });
  }

  setStatus(id: number, status: CarpetOrderStatus): CarpetOrderWithItems {
    this.db.run(
      `UPDATE carpet_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      status,
      id,
    );
    return this.getById(id)!;
  }
}
