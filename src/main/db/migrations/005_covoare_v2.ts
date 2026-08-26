/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { Migration } from './index';

/**
 * Copie locală, minimă, a normalizării de telefon (vezi `shared/schemas/carpet.ts::normalizePhoneRo`).
 * O migrație e „înghețată" — nu importă logică live din `shared/`, ca să nu-i schimbe comportamentul
 * dacă acea funcție evoluează ulterior.
 */
function normalizeForBackfill(phone: string): string {
  let digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('0040') && digits.length > 4) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('40') && digits.length > 2) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('00') && digits.length > 2) digits = digits.slice(2);
  return digits;
}

/**
 * Covoare v2 — completează spațiul de lucru Covoare, complet izolat de DDD/Cauciucuri:
 *  - căutare rapidă după telefon, indiferent de format (0722.../ +40722.../ 0040722...);
 *  - setări simple ale spălătoriei (preț/mp implicit, termen implicit, remindere);
 *  - jurnal PROPRIU de mesaje WhatsApp — tabel nou, `carpet_message_logs`, complet separat de
 *    `message_logs` (DDD/Cauciucuri): nicio coloană nouă pe un tabel partajat.
 */
export const migration005: Migration = {
  version: 5,
  name: 'covoare_v2',
  up(db) {
    db.exec(`
      ALTER TABLE carpet_clients ADD COLUMN phone_normalized TEXT;
      CREATE INDEX idx_carpet_clients_phone_normalized ON carpet_clients(phone_normalized);

      CREATE TABLE carpet_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        -- Preț/mp implicit — doar informativ, propus la o comandă nouă; NU generează facturare.
        default_price_per_sqm REAL,
        -- Termen implicit (zile de la preluare) — doar propus, se poate schimba pe fiecare comandă.
        default_due_days INTEGER,
        notify_on_ready INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_ready IN (0, 1)),
        revisit_months INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO carpet_settings (id) VALUES (1);

      CREATE TABLE carpet_message_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES carpet_clients(id),
        channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
        recipient TEXT NOT NULL,
        message_preview TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_carpet_message_logs_client ON carpet_message_logs(client_id);
    `);

    // Backfill: completează phone_normalized pentru clienții deja existenți (creați înainte de v2).
    const rows = db.all<{ id: number; phone: string | null }>(
      `SELECT id, phone FROM carpet_clients WHERE phone IS NOT NULL`,
    );
    for (const row of rows) {
      const normalized = normalizeForBackfill(row.phone!);
      db.run(`UPDATE carpet_clients SET phone_normalized = ? WHERE id = ?`, normalized || null, row.id);
    }
  },
};
