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
  type TyreAppointmentCreate,
  type TyreAppointmentUpdate,
  type TyreAppointmentSetStatus,
  type TyreAppointmentListFilter,
  type TyreAppointmentListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

const LIST_SELECT = `
  SELECT a.*, v.plate_number AS plate_number, v.client_id AS client_id,
    c.name AS client_name, c.phone AS client_phone,
    (SELECT sw.id FROM tyre_swaps sw WHERE sw.appointment_id = a.id ORDER BY sw.id DESC LIMIT 1) AS swap_id
  FROM tyre_appointments a
  JOIN tyre_vehicles v ON v.id = a.vehicle_id
  JOIN tyre_clients c ON c.id = v.client_id
`;

export class TyreAppointmentRepository {
  constructor(private db: Db) {}

  getById(id: number): TyreAppointmentListItem | undefined {
    return this.db.get<TyreAppointmentListItem>(`${LIST_SELECT} WHERE a.id = ?`, id);
  }

  list(filter: TyreAppointmentListFilter): Paginated<TyreAppointmentListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.date) {
      where.push('a.appointment_date = ?');
      params.push(filter.date);
    }
    if (filter.date_from) {
      where.push('a.appointment_date >= ?');
      params.push(filter.date_from);
    }
    if (filter.date_to) {
      where.push('a.appointment_date <= ?');
      params.push(filter.date_to);
    }
    if (filter.status !== 'all') {
      where.push('a.status = ?');
      params.push(filter.status);
    }
    if (filter.vehicle_id) {
      where.push('a.vehicle_id = ?');
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
        `SELECT COUNT(*) AS n FROM tyre_appointments a
         JOIN tyre_vehicles v ON v.id = a.vehicle_id
         JOIN tyre_clients c ON c.id = v.client_id
         ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<TyreAppointmentListItem>(
      `${LIST_SELECT} ${whereSql}
       ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.id ASC
       LIMIT ? OFFSET ?`,
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

  create(data: TyreAppointmentCreate): TyreAppointmentListItem {
    const result = this.db.run(
      `INSERT INTO tyre_appointments (vehicle_id, appointment_date, appointment_time, work_type, season, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      data.vehicle_id,
      data.appointment_date,
      data.appointment_time,
      data.work_type,
      data.season,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: TyreAppointmentUpdate): TyreAppointmentListItem {
    this.db.run(
      `UPDATE tyre_appointments
       SET vehicle_id = ?, appointment_date = ?, appointment_time = ?, work_type = ?, season = ?, notes = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      data.vehicle_id,
      data.appointment_date,
      data.appointment_time,
      data.work_type,
      data.season,
      data.notes,
      data.id,
    );
    return this.getById(data.id)!;
  }

  setStatus(data: TyreAppointmentSetStatus): TyreAppointmentListItem {
    this.db.run(
      `UPDATE tyre_appointments SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      data.status,
      data.id,
    );
    return this.getById(data.id)!;
  }
}
