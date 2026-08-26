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
import type { Service, ServiceCreate, ServiceUpdate } from '../../../shared/schemas/service';

interface ServiceRow extends Omit<Service, 'active'> {
  active: number;
}

function toService(row: ServiceRow): Service {
  return { ...row, active: !!row.active };
}

export class ServiceRepository {
  constructor(private db: Db) {}

  list(includeInactive = true): Service[] {
    const sql = includeInactive
      ? 'SELECT * FROM services ORDER BY name COLLATE NOCASE'
      : 'SELECT * FROM services WHERE active = 1 ORDER BY name COLLATE NOCASE';
    return this.db.all<ServiceRow>(sql).map(toService);
  }

  getById(id: number): Service | undefined {
    const row = this.db.get<ServiceRow>('SELECT * FROM services WHERE id = ?', id);
    return row ? toService(row) : undefined;
  }

  create(data: ServiceCreate): Service {
    const result = this.db.run(
      'INSERT INTO services (name, default_interval_months) VALUES (?, ?)',
      data.name,
      data.default_interval_months,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(data: ServiceUpdate): Service {
    this.db.run(
      `UPDATE services
       SET name = ?, default_interval_months = ?, active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      data.name,
      data.default_interval_months,
      data.active ? 1 : 0,
      data.id,
    );
    return this.getById(data.id)!;
  }
}
