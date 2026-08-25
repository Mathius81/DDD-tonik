import type { Migration } from './index';

/**
 * WhatsApp Business Cloud API (spec: mod „automat" lângă modul asistat existent).
 *
 * - `whatsapp_template_map`: leagă un template local (message_templates, canal 'whatsapp')
 *   de un template aprobat pe Meta, cu limba și lista ORDONATĂ de variabile locale care
 *   umplu pozițiile {{1}}, {{2}}... din template-ul Meta. E folosită ca fallback automat
 *   când fereastra de 24h de conversație s-a închis (eroarea Meta 131047) și textul liber
 *   nu mai poate fi trimis.
 * - `contacts.whatsapp_consent_*`: Meta cere opt-in documentat înainte de a trimite
 *   template-uri. Coloanele sunt nullable — nu blochează trimiterea dacă lipsesc, doar
 *   înregistrează/expun data și sursa consimțământului când există.
 */
export const migration002: Migration = {
  version: 2,
  name: 'whatsapp_cloud_api_templates',
  up(db) {
    db.exec(`
      CREATE TABLE whatsapp_template_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_template_id INTEGER NOT NULL UNIQUE REFERENCES message_templates(id),
        meta_template_name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'ro',
        -- JSON: listă ordonată de nume de variabile locale (vezi template-render.ts).
        variables TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE contacts ADD COLUMN whatsapp_consent_at TEXT;
      ALTER TABLE contacts ADD COLUMN whatsapp_consent_source TEXT;
    `);
  },
};
