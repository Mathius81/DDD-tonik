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
import type {
  TyreMessageLogListFilter,
  TyreMessageLogListItem,
  TyreMessageLogSource,
  TyreMessageLogStatus,
  TyreSeason,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';
import { unaccentRo as unaccent } from '../../../shared/text';

const LIST_SELECT = `
  SELECT m.*, c.name AS client_name
  FROM tyre_message_log m
  JOIN tyre_clients c ON c.id = m.client_id
`;

export interface TyreMessageLogInsert {
  client_id: number;
  source: TyreMessageLogSource;
  season: TyreSeason | null;
  /** Cheia stabilă a ferestrei de sezon (vezi `tyreSeasonKey`) — `null` pentru mesaje fără sezon. */
  season_key: string | null;
  recipient: string | null;
  message_preview: string;
  status: TyreMessageLogStatus;
  /** Mesajul de eroare (doar pentru `status = 'failed'`) — vizibil operatorului, nu doar în loguri. */
  error_message?: string | null;
  /**
   * Data/ora LOCALĂ explicită (formatul `ctx.nowLocalIso()`), NU implicit `datetime('now')`
   * (care e UTC în SQLite). Scrisă explicit de fiecare apelant, ca `created_at` să nu mai
   * poată „aluneca" tăcut înapoi la UTC — exact defectul reparat aici: garda anti-spam
   * folosea `created_at >= începutul ferestrei (dată locală)`, iar comparația UTC-vs-local
   * făcea ca, în primele ore ale unei zile noi (până la +3 ore, ora României), rândurile
   * scrise cu puțin timp în urmă să pară „din ziua anterioară" și garda să nu le mai
   * recunoască, retrimițând mesajul la fiecare tick de scheduler (10 min).
   */
  created_at: string;
}

/**
 * Istoricul mesajelor WhatsApp trimise clienților Cauciucuri (manual sau remindere de
 * sezon). Servește și drept „gardă” anti-spam pentru remindere — vezi `hasBeenNotified`.
 */
export class TyreMessageLogRepository {
  constructor(private db: Db) {}

  insert(data: TyreMessageLogInsert): TyreMessageLogListItem {
    const result = this.db.run(
      `INSERT INTO tyre_message_log
         (client_id, channel, source, season, season_key, recipient, message_preview, status, error_message, created_at)
       VALUES (?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.client_id,
      data.source,
      data.season,
      data.season_key,
      data.recipient,
      data.message_preview,
      data.status,
      data.error_message ?? null,
      data.created_at,
    );
    return this.db.get<TyreMessageLogListItem>(
      `${LIST_SELECT} WHERE m.id = ?`,
      Number(result.lastInsertRowid),
    )!;
  }

  list(filter: TyreMessageLogListFilter): Paginated<TyreMessageLogListItem> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.client_id) {
      where.push('m.client_id = ?');
      params.push(filter.client_id);
    }
    if (filter.source !== 'all') {
      where.push('m.source = ?');
      params.push(filter.source);
    }
    if (filter.search) {
      const term = filter.search.trim();
      where.push(`(unaccent_ro(c.name) LIKE ? OR m.recipient LIKE ? OR m.message_preview LIKE ?)`);
      params.push(`%${unaccent(term)}%`, `%${term}%`, `%${term}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total =
      this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM tyre_message_log m JOIN tyre_clients c ON c.id = m.client_id ${whereSql}`,
        ...params,
      )?.n ?? 0;

    const rows = this.db.all<TyreMessageLogListItem>(
      `${LIST_SELECT} ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return {
      items: rows,
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /**
   * Gardă anti-spam: a mai primit clientul acest reminder de sezon în fereastra curentă
   * (`seasonKey`, ex. `iarna-2026`)? Cheia e stabilă — nu depinde de data exactă de
   * start/sfârșit configurată în Setări, care se poate schimba în mijlocul sezonului
   * (vezi migrația 007 și `tyreSeasonKey`).
   *
   * Contorizăm orice status DIFERIT de `failed`: `sent` (trimitere automată reușită,
   * cloud_api) și `prepared` (mod asistat — WhatsApp s-a deschis, considerăm trimis, ca
   * și înainte) înseamnă amândouă „clientul a fost contactat". Doar `failed` (încercare
   * automată nereușită) NU trebuie să blocheze reîncercarea — altfel un eșec s-ar afișa
   * drept „Trimis deja" în pagina Remindere, iar clientul n-ar mai primi niciodată mesajul
   * (vezi și `countFailedAttempts` pentru plafonul de reîncercări automate).
   */
  hasBeenNotified(clientId: number, season: TyreSeason, seasonKey: string): boolean {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tyre_message_log
       WHERE client_id = ? AND source = 'season_reminder' AND season = ? AND season_key = ? AND status != 'failed'`,
      clientId,
      season,
      seasonKey,
    );
    return (row?.n ?? 0) > 0;
  }

  /** Câte încercări AUTOMATE (cloud_api) au eșuat pentru acest client, în fereastra curentă. */
  countFailedAttempts(clientId: number, season: TyreSeason, seasonKey: string): number {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tyre_message_log
       WHERE client_id = ? AND source = 'season_reminder' AND season = ? AND season_key = ? AND status = 'failed'`,
      clientId,
      season,
      seasonKey,
    );
    return row?.n ?? 0;
  }

  /** Mesajul ultimei încercări eșuate pentru acest client, în fereastra curentă — sau `null`. */
  lastFailureMessage(clientId: number, season: TyreSeason, seasonKey: string): string | null {
    const row = this.db.get<{ error_message: string | null }>(
      `SELECT error_message FROM tyre_message_log
       WHERE client_id = ? AND source = 'season_reminder' AND season = ? AND season_key = ? AND status = 'failed'
       ORDER BY id DESC LIMIT 1`,
      clientId,
      season,
      seasonKey,
    );
    return row?.error_message ?? null;
  }
}
