import type { Db } from '../database';
import type {
  Intervention,
  InterventionListFilter,
  InterventionListItem,
} from '../../../shared/schemas/intervention';
import type { Paginated } from '../../../shared/schemas/common';

export class InterventionRepository {
  constructor(private db: Db) {}

  getById(id: number): Intervention | undefined {
    return this.db.get<Intervention>('SELECT * FROM interventions WHERE id = ?', id);
  }

  insert(data: {
    association_id: number;
    service_id: number;
    performed_date: string;
    interval_months: number;
    notes: string | null;
  }): Intervention {
    const result = this.db.run(
      `INSERT INTO interventions (association_id, service_id, performed_date, interval_months, notes)
       VALUES (?, ?, ?, ?, ?)`,
      data.association_id,
      data.service_id,
      data.performed_date,
      data.interval_months,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  list(filter: InterventionListFilter): Paginated<InterventionListItem> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.association_id) {
      where.push('i.association_id = ?');
      params.push(filter.association_id);
    }
    if (filter.service_id) {
      where.push('i.service_id = ?');
      params.push(filter.service_id);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM interventions i ${whereSql}`, ...params)
        ?.n ?? 0;

    const rows = this.db.all<InterventionListItem>(
      `SELECT i.*, a.name AS association_name, s.name AS service_name
       FROM interventions i
       JOIN associations a ON a.id = i.association_id
       JOIN services s ON s.id = i.service_id
       ${whereSql}
       ORDER BY i.performed_date DESC, i.id DESC
       LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return { items: rows, total, page: filter.page, pageSize: filter.pageSize };
  }
}
