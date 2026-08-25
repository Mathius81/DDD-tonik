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
    if (!row) {
      // Instalare complet nouă — nu există nimic de migrat, deci marcăm direct
      // `legacy_migrated`. Altfel, primul `save()` (din orice tab de Setări) ar
      // persista `legacy_migrated: false`, iar `get()`-urile ulterioare ar rula
      // migrarea 2 la infinit, suprascriind orice editare directă pe „ddd_dimineata”
      // cu valorile implicite (false/[]) ale câmpurilor vechi, care nu au existat
      // niciodată pentru acest utilizator.
      const fresh = settingsSchema.parse({});
      fresh.daily_digest.legacy_migrated = true;
      return fresh;
    }
    try {
      const settings = settingsSchema.parse(JSON.parse(row.value));
      const digest = settings.daily_digest;
      // Migrare 1: câmpul vechi cu un singur email devine primul destinatar.
      if (digest.email && digest.recipients.length === 0) {
        digest.recipients = [{ email: digest.email, active: true }];
        digest.email = '';
      }
      // Migrare 2 (o singură dată): raportul zilnic vechi (un singur raport, DDD,
      // dimineața) devine raportul „ddd_dimineata” din noul sistem cu 6 rapoarte
      // independente. Rulează o singură dată — `legacy_migrated` previne suprascrierea
      // editărilor ulterioare făcute de utilizator direct pe „ddd_dimineata”.
      if (!digest.legacy_migrated) {
        digest.reports.ddd_dimineata = {
          ...digest.reports.ddd_dimineata,
          enabled: digest.enabled,
          recipients: digest.recipients,
          send_at: digest.send_at || digest.reports.ddd_dimineata.send_at,
        };
        digest.legacy_migrated = true;
      }
      return settings;
    } catch {
      // Setări corupte — pornim de la valorile implicite, nu blocăm aplicația.
      // Marcăm migrarea ca făcută (ca la instalarea nouă): câmpurile vechi s-au
      // pierdut odată cu setările corupte, deci nu mai e nimic de migrat, iar o
      // migrare rulată ulterior ar suprascrie cu valori implicite goale exact
      // ce reconfigurează utilizatorul acum.
      const fresh = settingsSchema.parse({});
      fresh.daily_digest.legacy_migrated = true;
      return fresh;
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
