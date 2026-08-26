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
  Reminder,
  ReminderChannel,
  ReminderListFilter,
  ReminderListItem,
  ReminderStatus,
} from '../../../shared/schemas/reminder';
import type { Paginated } from '../../../shared/schemas/common';

export class ReminderRepository {
  constructor(private db: Db) {}

  getById(id: number): Reminder | undefined {
    return this.db.get<Reminder>('SELECT * FROM reminders WHERE id = ?', id);
  }

  /**
   * Inserează un reminder dacă nu există deja unul identic
   * (UNIQUE(followup_id, offset_days, channel) previne duplicatele).
   */
  insertIfMissing(data: {
    followup_id: number;
    offset_days: number;
    channel: ReminderChannel;
    scheduled_at: string;
  }): boolean {
    const result = this.db.run(
      `INSERT OR IGNORE INTO reminders (followup_id, offset_days, channel, scheduled_at)
       VALUES (?, ?, ?, ?)`,
      data.followup_id,
      data.offset_days,
      data.channel,
      data.scheduled_at,
    );
    return Number(result.changes) > 0;
  }

  /** Reminderele scadente de procesat (inclusiv cele restante după repornire). */
  listDue(nowIso: string, limit = 200): Reminder[] {
    return this.db.all<Reminder>(
      `SELECT * FROM reminders
       WHERE status = 'pending' AND scheduled_at <= ?
       ORDER BY scheduled_at
       LIMIT ?`,
      nowIso,
      limit,
    );
  }

  /**
   * „Reclamă" atomic un reminder `pending` pentru procesare (UPDATE condiționat pe
   * status, într-un singur pas SQL). Previne dubla trimitere când două tick-uri ale
   * scheduler-ului se suprapun: dacă rândul nu mai era `pending` (deja reclamat de
   * alt tick), UPDATE-ul nu modifică niciun rând și metoda întoarce `false`.
   */
  claimForProcessing(id: number): boolean {
    const result = this.db.run(
      `UPDATE reminders
       SET status = 'processing', updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
      id,
    );
    return Number(result.changes) > 0;
  }

  /**
   * La pornirea aplicației: reminderele rămase blocate pe `processing` dintr-o cădere
   * anterioară (aplicația s-a închis în timpul trimiterii) devin `failed` — deliberat
   * NU `pending`, ca să nu se retrimită automat un mesaj care poate a ajuns deja la
   * client; utilizatorul decide manual din pagina Remindere. Întoarce numărul de
   * rânduri recuperate.
   */
  sweepStuckProcessing(): number {
    const result = this.db.run(
      `UPDATE reminders
       SET status = 'failed',
           error_message = 'Întrerupt de închiderea aplicației — verifică dacă mesajul a plecat și retrimite dacă e cazul.',
           updated_at = datetime('now')
       WHERE status = 'processing'`,
    );
    return Number(result.changes);
  }

  setStatus(id: number, status: ReminderStatus, errorMessage?: string | null): void {
    this.db.run(
      `UPDATE reminders
       SET status = ?, error_message = ?, updated_at = datetime('now'),
           sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
       WHERE id = ?`,
      status,
      errorMessage ?? null,
      status,
      id,
    );
  }

  recordAttempt(id: number): void {
    this.db.run(
      `UPDATE reminders
       SET attempt_count = attempt_count + 1, last_attempt_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      id,
    );
  }

  /** Repune un reminder eșuat în coadă (retry manual). */
  requeue(id: number): void {
    this.db.run(
      `UPDATE reminders
       SET status = 'pending', error_message = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'failed'`,
      id,
    );
  }

  /** Anulează reminderele viitoare ale unui follow-up închis. */
  cancelPendingForFollowup(followupId: number): void {
    this.db.run(
      `UPDATE reminders
       SET status = 'cancelled', updated_at = datetime('now')
       WHERE followup_id = ? AND status = 'pending'`,
      followupId,
    );
  }

  /** Contoare per fereastră pentru tab-urile din pagina Remindere. */
  windowCounts(todayIso: string): Record<'today' | 'upcoming' | 'sent' | 'failed' | 'all', number> {
    const q = (sql: string, ...p: unknown[]) => this.db.get<{ n: number }>(sql, ...p)?.n ?? 0;
    return {
      today: q(
        `SELECT COUNT(*) AS n FROM reminders WHERE date(scheduled_at) = ? AND status IN ('pending','processing')`,
        todayIso,
      ),
      upcoming: q(
        `SELECT COUNT(*) AS n FROM reminders WHERE status = 'pending' AND date(scheduled_at) > ?`,
        todayIso,
      ),
      sent: q(`SELECT COUNT(*) AS n FROM reminders WHERE status = 'sent'`),
      failed: q(`SELECT COUNT(*) AS n FROM reminders WHERE status = 'failed'`),
      all: q(`SELECT COUNT(*) AS n FROM reminders`),
    };
  }

  countFailed(): number {
    return (
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM reminders WHERE status = 'failed'`)
        ?.n ?? 0
    );
  }

  list(filter: ReminderListFilter, todayIso: string): Paginated<ReminderListItem> {
    const where: string[] = [];
    const params: unknown[] = [];
    switch (filter.window) {
      case 'today':
        where.push(`date(r.scheduled_at) = ? AND r.status IN ('pending','processing')`);
        params.push(todayIso);
        break;
      case 'upcoming':
        where.push(`r.status = 'pending' AND date(r.scheduled_at) > ?`);
        params.push(todayIso);
        break;
      case 'sent':
        where.push(`r.status = 'sent'`);
        break;
      case 'failed':
        where.push(`r.status = 'failed'`);
        break;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const baseJoin = `
      FROM reminders r
      JOIN followups f ON f.id = r.followup_id
      JOIN associations a ON a.id = f.association_id
      JOIN services s ON s.id = f.service_id
      LEFT JOIN contacts c ON c.id = (
        SELECT c2.id FROM contacts c2
        WHERE c2.association_id = f.association_id AND c2.deleted_at IS NULL
        ORDER BY c2.is_primary DESC, c2.id LIMIT 1
      )
    `;

    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${baseJoin} ${whereSql}`, ...params)?.n ?? 0;

    const rows = this.db.all<ReminderListItem>(
      `SELECT r.*, f.association_id, a.name AS association_name, s.name AS service_name,
              f.due_date, c.name AS recipient_name,
              CASE r.channel
                WHEN 'whatsapp' THEN c.phone
                WHEN 'email' THEN c.email
                ELSE NULL
              END AS recipient_detail
       ${baseJoin} ${whereSql}
       ORDER BY r.scheduled_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return { items: rows, total, page: filter.page, pageSize: filter.pageSize };
  }
}
