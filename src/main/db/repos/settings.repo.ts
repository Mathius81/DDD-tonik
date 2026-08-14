import type { Db } from '../database';
import { settingsSchema, type Settings } from '../../../shared/schemas/settings';

const SETTINGS_KEY = 'app_settings';

/**
 * Setările aplicației: un singur rând JSON validat cu zod.
 * Secretele (parole/token-uri) NU trec pe aici — vezi secrets.service.
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  get(): Settings {
    const row = this.db.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      SETTINGS_KEY,
    );
    if (!row) return settingsSchema.parse({});
    try {
      const settings = settingsSchema.parse(JSON.parse(row.value));
      // Migrare: câmpul vechi cu un singur email devine primul destinatar.
      if (settings.daily_digest.email && settings.daily_digest.recipients.length === 0) {
        settings.daily_digest.recipients = [
          { email: settings.daily_digest.email, active: true },
        ];
        settings.daily_digest.email = '';
      }
      return settings;
    } catch {
      // Setări corupte — pornim de la valorile implicite, nu blocăm aplicația.
      return settingsSchema.parse({});
    }
  }

  save(settings: Settings): void {
    const validated = settingsSchema.parse(settings);
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      SETTINGS_KEY,
      JSON.stringify(validated),
    );
  }

  /** Valori brute (folosit pentru secrete criptate, stocate sub chei separate). */
  getRaw(key: string): string | undefined {
    return this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value;
  }

  setRaw(key: string, value: string): void {
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      key,
      value,
    );
  }

  deleteRaw(key: string): void {
    this.db.run('DELETE FROM settings WHERE key = ?', key);
  }
}
