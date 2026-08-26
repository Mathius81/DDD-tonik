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
import type { CarpetSettings, CarpetSettingsUpdate } from '../../../shared/schemas/carpet';

interface CarpetSettingsRow {
  default_price_per_sqm: number | null;
  default_due_days: number | null;
  notify_on_ready: number;
  revisit_months: number | null;
  updated_at: string;
}

function toSettings(row: CarpetSettingsRow): CarpetSettings {
  return { ...row, notify_on_ready: row.notify_on_ready === 1 };
}

/** Setările spălătoriei de covoare — un singur rând (id = 1), creat de migrația 005. */
export class CarpetSettingsRepository {
  constructor(private db: Db) {}

  get(): CarpetSettings {
    const row = this.db.get<CarpetSettingsRow>('SELECT * FROM carpet_settings WHERE id = 1');
    // Rândul e creat de migrație (INSERT INTO carpet_settings (id) VALUES (1)) — nu ar trebui
    // să lipsească niciodată, dar păstrăm un fallback sigur ca să nu pice UI-ul.
    if (!row) {
      return {
        default_price_per_sqm: null,
        default_due_days: null,
        notify_on_ready: true,
        revisit_months: null,
        updated_at: new Date().toISOString(),
      };
    }
    return toSettings(row);
  }

  update(data: CarpetSettingsUpdate): CarpetSettings {
    this.db.run(
      `UPDATE carpet_settings
       SET default_price_per_sqm = ?, default_due_days = ?, notify_on_ready = ?, revisit_months = ?,
           updated_at = datetime('now')
       WHERE id = 1`,
      data.default_price_per_sqm,
      data.default_due_days,
      data.notify_on_ready ? 1 : 0,
      data.revisit_months,
    );
    return this.get();
  }
}
