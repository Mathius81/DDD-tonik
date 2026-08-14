import type { Db } from '../database';
import type {
  Association,
  AssociationCreate,
  AssociationUpdate,
  AssociationListFilter,
  AssociationListItem,
} from '../../../shared/schemas/association';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

interface AssociationRow extends Omit<Association, 'active'> {
  active: number;
  primary_contact_name?: string | null;
  primary_contact_phone?: string | null;
  next_due_date?: string | null;
  next_service_name?: string | null;
  active_services?: string | null;
}

function toAssociation(row: AssociationRow): Association {
  return { ...row, active: !!row.active };
}

export class AssociationRepository {
  constructor(private db: Db) {}

  list(filter: AssociationListFilter): Paginated<AssociationListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.status === 'active') where.push('a.active = 1');
    if (filter.status === 'inactive') where.push('a.active = 0');
    if (filter.search) {
      // unaccent_ro e o funcție SQL înregistrată în Db: 'ploiesti' găsește 'Ploiești'.
      where.push(`(
        unaccent_ro(a.name) LIKE ? OR unaccent_ro(a.address) LIKE ? OR unaccent_ro(a.city) LIKE ? OR EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.association_id = a.id AND c.deleted_at IS NULL
            AND (unaccent_ro(c.name) LIKE ? OR c.phone LIKE ?)
        )
      )`);
      const term = `%${unaccent(filter.search)}%`;
      params.push(term, term, term, term, `%${filter.search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM associations a ${whereSql}`, ...params)
        ?.n ?? 0;

    const rows = this.db.all<AssociationRow>(
      `
      SELECT a.*,
        (SELECT c.name FROM contacts c WHERE c.association_id = a.id AND c.deleted_at IS NULL
          ORDER BY c.is_primary DESC, c.id LIMIT 1) AS primary_contact_name,
        (SELECT c.phone FROM contacts c WHERE c.association_id = a.id AND c.deleted_at IS NULL
          ORDER BY c.is_primary DESC, c.id LIMIT 1) AS primary_contact_phone,
        (SELECT f.due_date FROM followups f
          WHERE f.association_id = a.id AND f.status IN ('pending','contacted','scheduled')
          ORDER BY f.due_date LIMIT 1) AS next_due_date,
        (SELECT s.name FROM followups f JOIN services s ON s.id = f.service_id
          WHERE f.association_id = a.id AND f.status IN ('pending','contacted','scheduled')
          ORDER BY f.due_date LIMIT 1) AS next_service_name,
        (SELECT GROUP_CONCAT(DISTINCT s.name) FROM followups f JOIN services s ON s.id = f.service_id
          WHERE f.association_id = a.id AND f.status IN ('pending','contacted','scheduled')
        ) AS active_services
      FROM associations a
      ${whereSql}
      ORDER BY a.name COLLATE NOCASE
      LIMIT ? OFFSET ?
      `,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows.map((r) => ({
        ...toAssociation(r),
        primary_contact_name: r.primary_contact_name ?? null,
        primary_contact_phone: r.primary_contact_phone ?? null,
        next_due_date: r.next_due_date ?? null,
        next_service_name: r.next_service_name ?? null,
        active_services: r.active_services ? r.active_services.split(',') : [],
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  getById(id: number): Association | undefined {
    const row = this.db.get<AssociationRow>('SELECT * FROM associations WHERE id = ?', id);
    return row ? toAssociation(row) : undefined;
  }

  create(data: AssociationCreate): Association {
    const result = this.db.run(
      `INSERT INTO associations (name, tax_id, address, city, county, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      data.name,
      data.tax_id,
      data.address,
      data.city,
      data.county,
      data.notes,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: AssociationUpdate): Association {
    this.db.run(
      `UPDATE associations
       SET name = ?, tax_id = ?, address = ?, city = ?, county = ?, notes = ?, active = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      data.name,
      data.tax_id,
      data.address,
      data.city,
      data.county,
      data.notes,
      data.active ? 1 : 0,
      data.id,
    );
    return this.getById(data.id)!;
  }

  setActive(id: number, active: boolean): void {
    this.db.run(
      `UPDATE associations SET active = ?, updated_at = datetime('now') WHERE id = ?`,
      active ? 1 : 0,
      id,
    );
  }
}
