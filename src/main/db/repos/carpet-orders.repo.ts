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
  type CarpetCalendarDayEntry,
  type CarpetClientGroup,
  type CarpetClientOrderSummary,
  type CarpetOrder,
  type CarpetOrderCreate,
  type CarpetOrderItem,
  type CarpetOrderItemInput,
  type CarpetOrderListFilter,
  type CarpetOrderListItem,
  type CarpetOrderStatus,
  type CarpetOrderUpdate,
  type CarpetOrderWithItems,
  type CarpetTodoSummary,
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
      // Telefonul e cheia principală de căutare — comparăm și pe forma normalizată, ca la
      // clienți, ca să funcționeze indiferent de formatul introdus (0722.../ +40722...).
      const normalizedTerm = normalizePhoneRo(filter.search);
      where.push(`(
        unaccent_ro(c.name) LIKE ? OR c.phone LIKE ? OR (? != '' AND c.phone_normalized LIKE ?)
      )`);
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, `%${filter.search}%`, normalizedTerm, `%${normalizedTerm}%`);
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

  /** Intrări de calendar pentru o lună (preluări + termene) — pentru pagina Calendar Covoare. */
  calendarMonth(month: string): CarpetCalendarDayEntry[] {
    const like = `${month}-%`;
    const rows = this.db.all<{
      id: number;
      client_name: string;
      status: CarpetOrderStatus;
      pickup_date: string;
      due_date: string | null;
    }>(
      `SELECT o.id, c.name AS client_name, o.status, o.pickup_date, o.due_date
       FROM carpet_orders o
       JOIN carpet_clients c ON c.id = o.client_id
       WHERE o.pickup_date LIKE ? OR o.due_date LIKE ?`,
      like,
      like,
    );
    const entries: CarpetCalendarDayEntry[] = [];
    for (const r of rows) {
      if (r.pickup_date.startsWith(month)) {
        entries.push({
          date: r.pickup_date,
          kind: 'pickup',
          order_id: r.id,
          client_name: r.client_name,
          status: r.status,
        });
      }
      if (r.due_date && r.due_date.startsWith(month)) {
        entries.push({
          date: r.due_date,
          kind: 'due',
          order_id: r.id,
          client_name: r.client_name,
          status: r.status,
        });
      }
    }
    return entries;
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

  /**
   * Comenzile de urmărit azi pentru cardul „De făcut azi” din bara laterală: gata de livrat
   * SAU cu termen depășit (și nelivrate încă). Un ordin nu e numărat de două ori — verificăm
   * întâi `gata` — deci o comandă „gata” cu termen deja depășit apare o singură dată, cu
   * motivul „gata” (mai acționabil: clientul poate veni oricând să o ridice).
   */
  todosForDashboard(todayIso: string, limit = 20): CarpetTodoSummary {
    const where = `(o.status = 'gata' OR (o.due_date IS NOT NULL AND o.due_date < ? AND o.status != 'livrat'))`;
    const badge =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM carpet_orders o WHERE ${where}`, todayIso)
        ?.n ?? 0;
    const rows = this.db.all<{
      id: number;
      client_name: string;
      status: CarpetOrderStatus;
      due_date: string | null;
    }>(
      `SELECT o.id, c.name AS client_name, o.status, o.due_date
       FROM carpet_orders o
       JOIN carpet_clients c ON c.id = o.client_id
       WHERE ${where}
       ORDER BY (o.status = 'gata') DESC, o.due_date ASC, o.id DESC
       LIMIT ?`,
      todayIso,
      limit,
    );
    return {
      badge,
      items: rows.map((r) => ({
        order_id: r.id,
        client_name: r.client_name,
        reason: r.status === 'gata' ? ('gata' as const) : ('overdue' as const),
        due_date: r.due_date,
      })),
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

  /**
   * Creare comandă — dacă nu vine `client_id`, clientul e creat automat, în ACEEAȘI tranzacție,
   * din `client_name`/`client_phone`/`client_address`/`client_notes` (formular unic, de la
   * tejghea). Același tipar ca la mașini, vezi `tyre-vehicles.repo.ts::create()`.
   */
  create(data: CarpetOrderCreate): CarpetOrderWithItems {
    return this.db.transaction(() => {
      let clientId = data.client_id;
      if (!clientId) {
        const phone = data.client_phone;
        const clientResult = this.db.run(
          `INSERT INTO carpet_clients (name, phone, phone_normalized, address, notes) VALUES (?, ?, ?, ?, ?)`,
          data.client_name,
          phone,
          phone ? normalizePhoneRo(phone) || null : null,
          data.client_address,
          data.client_notes,
        );
        clientId = Number(clientResult.lastInsertRowid);
      }

      const result = this.db.run(
        `INSERT INTO carpet_orders (client_id, pickup_date, due_date, status, price_per_sqm, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        clientId,
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

  /**
   * Situația agregată a unui client — „adunate per client”, cerința clientului: aceeași
   * persoană poate avea mai multe comenzi (rânduri separate în lista de comenzi), aici
   * apar TOATE la un loc. Gruparea principală e după `client_id` (legătura există deja pe
   * `carpet_orders`); unificăm și după telefonul normalizat (`phone_normalized`) pentru
   * cazul rar al unui client introdus din greșeală de două ori — la fel ca la
   * `computeAdministratorGroups` din DDD. Interogări BATCHED (IN (...)), un număr FIX
   * (4), indiferent de câți clienți se unifică sau câte comenzi/covoare are grupul — nu
   * există nicio interogare per comandă sau per covor.
   */
  getClientGroup(clientId: number): CarpetClientGroup | undefined {
    interface ClientRow {
      id: number;
      name: string;
      phone: string | null;
      updated_at: string;
    }

    const client = this.db.get<ClientRow & { phone_normalized: string | null }>(
      `SELECT id, name, phone, phone_normalized, updated_at FROM carpet_clients WHERE id = ?`,
      clientId,
    );
    if (!client) return undefined;

    // Fără telefon (sau telefon nenormalizabil) — clientul rămâne singur în propriul grup;
    // NU se poate compara sigur cu alți clienți fără telefon (ar risca uniri greșite pe nume).
    const siblings: ClientRow[] = client.phone_normalized
      ? this.db.all<ClientRow>(
          `SELECT id, name, phone, updated_at FROM carpet_clients WHERE phone_normalized = ?`,
          client.phone_normalized,
        )
      : [{ id: client.id, name: client.name, phone: client.phone, updated_at: client.updated_at }];

    const clientIds = siblings.map((c) => c.id);
    const clientPlaceholders = clientIds.map(() => '?').join(',');

    const rows = this.db.all<OrderListRow>(
      `${LIST_SELECT} WHERE o.client_id IN (${clientPlaceholders}) ORDER BY o.pickup_date DESC, o.id DESC`,
      ...clientIds,
    );

    const orderIds = rows.map((r) => r.id);
    const itemsByOrder = new Map<number, CarpetOrderItem[]>();
    if (orderIds.length > 0) {
      const orderPlaceholders = orderIds.map(() => '?').join(',');
      const items = this.db.all<CarpetOrderItem>(
        `SELECT * FROM carpet_order_items WHERE order_id IN (${orderPlaceholders}) ORDER BY order_id, id`,
        ...orderIds,
      );
      for (const item of items) {
        const list = itemsByOrder.get(item.order_id);
        if (list) list.push(item);
        else itemsByOrder.set(item.order_id, [item]);
      }
    }

    const toSummary = (r: OrderListRow): CarpetClientOrderSummary => ({
      order_id: r.id,
      status: r.status,
      pickup_date: r.pickup_date,
      due_date: r.due_date,
      items: (itemsByOrder.get(r.id) ?? []).map((i) => ({
        type: i.type,
        length_m: i.length_m,
        width_m: i.width_m,
        sqm: i.sqm,
      })),
      total_sqm: r.total_sqm,
      total_price: totalPrice(r.price_per_sqm, r.total_sqm),
    });

    const openOrders = rows.filter((r) => r.status !== 'livrat').map(toSummary);
    const deliveredOrders = rows.filter((r) => r.status === 'livrat').map(toSummary);

    // Nume/telefon afișate: clientul cel mai recent actualizat din grup (la fel ca
    // `display_name` la Administratori) — de regulă identic, diferă doar în cazul rar al
    // unui duplicat introdus manual de două ori.
    const mostRecent = [...siblings].sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1))[0];

    return {
      client_ids: clientIds,
      display_name: mostRecent.name,
      phone_display: mostRecent.phone,
      open_orders: openOrders,
      delivered_orders: deliveredOrders,
      total_open_items: openOrders.reduce((sum, o) => sum + o.items.length, 0),
      total_open_sqm: round2(openOrders.reduce((sum, o) => sum + o.total_sqm, 0)),
    };
  }
}
