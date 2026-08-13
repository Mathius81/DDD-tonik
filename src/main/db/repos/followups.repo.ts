import type { Db } from '../database';
import type {
  Followup,
  FollowupListFilter,
  FollowupListItem,
  FollowupStatus,
} from '../../../shared/schemas/followup';
import type { Paginated } from '../../../shared/schemas/common';

interface FollowupJoinedRow extends Followup {
  association_name: string;
  service_name: string;
  primary_contact_id: number | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  primary_contact_do_not_contact: number | null;
}

const JOINED_SELECT = `
  SELECT f.*, a.name AS association_name, s.name AS service_name,
    c.id AS primary_contact_id, c.name AS primary_contact_name,
    c.phone AS primary_contact_phone, c.email AS primary_contact_email,
    c.do_not_contact AS primary_contact_do_not_contact
  FROM followups f
  JOIN associations a ON a.id = f.association_id
  JOIN services s ON s.id = f.service_id
  LEFT JOIN contacts c ON c.id = (
    SELECT c2.id FROM contacts c2
    WHERE c2.association_id = f.association_id AND c2.deleted_at IS NULL
    ORDER BY c2.is_primary DESC, c2.id LIMIT 1
  )
`;

export class FollowupRepository {
  constructor(private db: Db) {}

  getById(id: number): Followup | undefined {
    return this.db.get<Followup>('SELECT * FROM followups WHERE id = ?', id);
  }

  insert(data: {
    association_id: number;
    service_id: number;
    source_intervention_id: number | null;
    due_date: string;
  }): Followup {
    const result = this.db.run(
      `INSERT INTO followups (association_id, service_id, source_intervention_id, due_date)
       VALUES (?, ?, ?, ?)`,
      data.association_id,
      data.service_id,
      data.source_intervention_id,
      data.due_date,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  /** Follow-up-uri deschise (pending/contacted/scheduled) pentru asociație + serviciu. */
  findOpen(associationId: number, serviceId: number): Followup[] {
    return this.db.all<Followup>(
      `SELECT * FROM followups
       WHERE association_id = ? AND service_id = ?
         AND status IN ('pending','contacted','scheduled')`,
      associationId,
      serviceId,
    );
  }

  setStatus(id: number, status: FollowupStatus): void {
    this.db.run(
      `UPDATE followups SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      status,
      id,
    );
  }

  markContacted(id: number): void {
    this.db.run(
      `UPDATE followups
       SET status = 'contacted', contacted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
      id,
    );
  }

  schedule(id: number, date: string, time: string | null, notes: string | null): void {
    this.db.run(
      `UPDATE followups
       SET status = 'scheduled', scheduled_date = ?, scheduled_time = ?,
           notes = COALESCE(?, notes), updated_at = datetime('now')
       WHERE id = ? AND status IN ('pending','contacted')`,
      date,
      time,
      notes,
      id,
    );
  }

  cancel(id: number, notes: string | null): void {
    this.db.run(
      `UPDATE followups
       SET status = 'cancelled', notes = COALESCE(?, notes), updated_at = datetime('now')
       WHERE id = ? AND status IN ('pending','contacted','scheduled')`,
      notes,
      id,
    );
  }

  list(filter: FollowupListFilter, todayIso: string): Paginated<FollowupListItem> {
    const where: string[] = ['a.active = 1'];
    const params: unknown[] = [];

    if (filter.association_id) {
      where.splice(0); // pe fișa asociației arătăm și follow-up-urile celor inactive
      where.push('f.association_id = ?');
      params.push(filter.association_id);
    }
    if (filter.status !== 'all') {
      where.push('f.status = ?');
      params.push(filter.status);
    }
    switch (filter.window) {
      case 'overdue':
        where.push(`f.status IN ('pending','contacted') AND f.due_date < ?`);
        params.push(todayIso);
        break;
      case 'today':
        where.push(`f.status IN ('pending','contacted') AND f.due_date = ?`);
        params.push(todayIso);
        break;
      case 'next7':
        where.push(`f.status IN ('pending','contacted') AND f.due_date >= ? AND f.due_date <= date(?, '+7 days')`);
        params.push(todayIso, todayIso);
        break;
      case 'next30':
        where.push(`f.status IN ('pending','contacted') AND f.due_date >= ? AND f.due_date <= date(?, '+30 days')`);
        params.push(todayIso, todayIso);
        break;
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total =
      this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM followups f JOIN associations a ON a.id = f.association_id ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<FollowupJoinedRow>(
      `${JOINED_SELECT} ${whereSql}
       ORDER BY f.due_date, f.id
       LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows.map((r) => this.toListItem(r, todayIso)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /** Follow-up-urile pentru dashboard: restante + apropiate, sortate pe priorități. */
  listAttention(todayIso: string, limit: number): FollowupListItem[] {
    const rows = this.db.all<FollowupJoinedRow>(
      `${JOINED_SELECT}
       WHERE a.active = 1 AND f.status IN ('pending','contacted')
         AND f.due_date <= date(?, '+30 days')
       ORDER BY f.due_date, f.id
       LIMIT ?`,
      todayIso,
      limit,
    );
    return rows.map((r) => this.toListItem(r, todayIso));
  }

  counts(todayIso: string): {
    overdue: number;
    next7: number;
    next30: number;
    scheduled: number;
  } {
    const q = (sql: string, ...p: unknown[]) => this.db.get<{ n: number }>(sql, ...p)?.n ?? 0;
    const base = `FROM followups f JOIN associations a ON a.id = f.association_id WHERE a.active = 1`;
    return {
      overdue: q(
        `SELECT COUNT(*) AS n ${base} AND f.status IN ('pending','contacted') AND f.due_date < ?`,
        todayIso,
      ),
      next7: q(
        `SELECT COUNT(*) AS n ${base} AND f.status IN ('pending','contacted')
         AND f.due_date >= ? AND f.due_date <= date(?, '+7 days')`,
        todayIso,
        todayIso,
      ),
      next30: q(
        `SELECT COUNT(*) AS n ${base} AND f.status IN ('pending','contacted')
         AND f.due_date > date(?, '+7 days') AND f.due_date <= date(?, '+30 days')`,
        todayIso,
        todayIso,
      ),
      scheduled: q(`SELECT COUNT(*) AS n ${base} AND f.status = 'scheduled'`),
    };
  }

  /** Intrări calendar pentru o lună: scadențe + programări. */
  calendarMonth(monthPrefix: string, serviceId?: number): Array<{
    date: string;
    kind: 'due' | 'scheduled';
    followup_id: number;
    association_id: number;
    association_name: string;
    service_id: number;
    service_name: string;
    scheduled_time: string | null;
    status: string;
  }> {
    const serviceFilter = serviceId ? 'AND f.service_id = ?' : '';
    const params: unknown[] = serviceId ? [serviceId] : [];
    return this.db.all(
      `
      SELECT f.due_date AS date, 'due' AS kind, f.id AS followup_id,
             f.association_id, a.name AS association_name,
             f.service_id, s.name AS service_name, NULL AS scheduled_time, f.status
      FROM followups f
      JOIN associations a ON a.id = f.association_id
      JOIN services s ON s.id = f.service_id
      WHERE a.active = 1 AND f.status IN ('pending','contacted')
        AND f.due_date LIKE ? ${serviceFilter}
      UNION ALL
      SELECT f.scheduled_date AS date, 'scheduled' AS kind, f.id AS followup_id,
             f.association_id, a.name AS association_name,
             f.service_id, s.name AS service_name, f.scheduled_time, f.status
      FROM followups f
      JOIN associations a ON a.id = f.association_id
      JOIN services s ON s.id = f.service_id
      WHERE a.active = 1 AND f.status = 'scheduled'
        AND f.scheduled_date LIKE ? ${serviceFilter}
      ORDER BY date, scheduled_time
      `,
      `${monthPrefix}%`,
      ...params,
      `${monthPrefix}%`,
      ...params,
    ) as never;
  }

  private toListItem(r: FollowupJoinedRow, todayIso: string): FollowupListItem {
    const days = Math.round(
      (Date.parse(`${r.due_date}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000,
    );
    return {
      ...r,
      days_remaining: days,
      primary_contact_do_not_contact: !!r.primary_contact_do_not_contact,
    };
  }
}
