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

interface MonthDay {
  month: number;
  day: number;
}
interface SeasonWindow {
  start: MonthDay;
  end: MonthDay;
}

/**
 * Copie locală, ÎNGHEȚATĂ, a `seasonWindowStartYear` din `shared/schemas/tyre.ts` — folosită
 * DOAR pentru backfill-ul rândurilor istorice de mai jos. O migrație nu importă logică live
 * din `shared/` (convenție stabilită în migrația 005 — `normalizeForBackfill`), ca să nu-i
 * schimbe comportamentul dacă acea funcție evoluează ulterior.
 *
 * Notă privind precizia: rândurile vechi au `created_at` scris în UTC (`datetime('now')` —
 * chiar defectul reparat de acest agent în `tyre-message-log.repo.ts`); folosim componentele
 * UTC ale acelei date ca reper „azi” pentru calcul, ca backfill-ul să fie determinist
 * indiferent de fusul orar al mașinii pe care rulează migrația. Fereastra e definită doar
 * în lună+zi, deci o eroare de câteva ore la granița UTC/local schimbă anul de start doar
 * într-o fereastră extrem de îngustă (miezul nopții de 31 decembrie/1 ianuarie) — acceptabil
 * pentru un backfill istoric, o singură dată.
 */
function seasonWindowStartYearForBackfill(window: SeasonWindow, referenceUtc: Date): number {
  const year = referenceUtc.getUTCFullYear();
  const startMD = window.start.month * 100 + window.start.day;
  const endMD = window.end.month * 100 + window.end.day;
  const todayMD = (referenceUtc.getUTCMonth() + 1) * 100 + referenceUtc.getUTCDate();
  return startMD > endMD && todayMD <= endMD ? year - 1 : year;
}

/** Valorile implicite din `defaultTyreSeasonReminderSettings` — copiate literal, nu importate. */
const DEFAULT_WINDOWS: Record<'iarna' | 'vara', SeasonWindow> = {
  iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
  vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
};

/**
 * Cauciucuri — repară trei defecte ale reminder-elor automate de sezon:
 *
 * 1. `season_key` (ex. `iarna-2026`): gardă anti-spam stabilă, independentă de data exactă
 *    de start a ferestrei configurate în Setări — vezi `tyreSeasonKey` în `shared/schemas/tyre.ts`
 *    pentru explicația completă (mutarea datelor ferestrei nu mai resetează garda).
 * 2. `error_message`: mesajul de eroare al unei încercări automate eșuate, păstrat vizibil
 *    pentru operator (pagina Remindere), nu doar în loguri de aplicație.
 * 3. Un șablon local „ancoră", INACTIV, pentru maparea Meta a reminder-elor trimise prin
 *    WhatsApp Cloud API — necesar ca fallback-ul de template (`MessagingService`) să aibă
 *    un `templateUsedId` real de căutat în `whatsapp_template_map`, nu `null`.
 *
 * Backfill: rândurile `tyre_message_log` deja existente (sursă `season_reminder`) primesc
 * un `season_key` calculat din propriul `created_at` și ferestrele curente din Setări (sau
 * cele implicite, dacă Setările lipsesc/sunt corupte) — esențial ca migrația să nu declanșeze
 * o retrimitere în masă imediat după actualizare, în mijlocul unei ferestre active.
 */
export const migration007: Migration = {
  version: 7,
  name: 'cauciucuri_season_key',
  up(db) {
    db.exec(`
      ALTER TABLE tyre_message_log ADD COLUMN season_key TEXT;
      ALTER TABLE tyre_message_log ADD COLUMN error_message TEXT;
      -- Suportă direct noua gardă anti-spam: „a mai primit clientul X reminder-ul de sezon
      -- Y cu succes, în fereastra curentă (season_key)?" — vezi TyreMessageLogRepository.
      CREATE INDEX idx_tyre_message_log_season_key ON tyre_message_log(client_id, source, season_key, status);
    `);

    // Ferestrele curente configurate de utilizator (dacă există și sunt valide).
    let windows = DEFAULT_WINDOWS;
    const rawSettings = db.get<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'tyre_season_reminder_settings'`,
    );
    if (rawSettings?.value) {
      try {
        const parsed = JSON.parse(rawSettings.value) as { windows?: Partial<Record<'iarna' | 'vara', SeasonWindow>> };
        if (parsed.windows?.iarna && parsed.windows?.vara) {
          windows = { iarna: parsed.windows.iarna, vara: parsed.windows.vara };
        }
      } catch {
        // Setări corupte -> rămânem pe valorile implicite.
      }
    }

    const rows = db.all<{ id: number; season: 'vara' | 'iarna' | null; created_at: string }>(
      `SELECT id, season, created_at FROM tyre_message_log WHERE source = 'season_reminder' AND season IS NOT NULL`,
    );
    for (const row of rows) {
      if (!row.season) continue;
      const referenceUtc = new Date(`${row.created_at.replace(' ', 'T')}Z`);
      const year = seasonWindowStartYearForBackfill(windows[row.season], referenceUtc);
      const seasonKey = `${row.season}-${year}`;
      db.run(`UPDATE tyre_message_log SET season_key = ? WHERE id = ?`, seasonKey, row.id);
    }

    // Șablon-ancoră pentru maparea Meta a reminder-elor de sezon (Defectul 2 din raportul
    // de reparații): creat INACTIV — activarea lui din Setări → Mesaje → Șabloane ar
    // dezactiva șablonul WhatsApp implicit al DDD-ului (un singur șablon activ per canal,
    // vezi `MessageRepository.createTemplate`). Owner-ul configurează DOAR maparea Meta
    // din Setări → WhatsApp → Mapare template-uri, nu activează acest șablon.
    const inserted = db.run(
      `INSERT INTO message_templates (name, channel, subject, body, active) VALUES (?, 'whatsapp', NULL, ?, 0)`,
      'NU ACTIVA — Cauciucuri: reminder sezon (mapare Meta)',
      'Șablon tehnic — folosit doar ca ancoră pentru maparea Meta a reminder-elor automate de ' +
        'sezon (Cauciucuri). NU activa acest șablon din Setări → Mesaje → Șabloane — ar dezactiva ' +
        'șablonul WhatsApp implicit al DDD-ului. Configurează maparea Meta din Setări → WhatsApp → ' +
        'Mapare template-uri.',
    );
    db.run(
      `INSERT INTO settings (key, value) VALUES ('tyre_season_reminder_whatsapp_template_id', ?)`,
      String(Number(inserted.lastInsertRowid)),
    );
  },
};
