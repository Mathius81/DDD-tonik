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
import type { CarpetMessageListFilter, CarpetMessageLogItem } from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';

export interface CarpetMessageInsert {
  client_id: number;
  recipient: string;
  message_preview: string;
}

/**
 * Jurnal PROPRIU de mesaje al spațiului Covoare — complet izolat de `message_logs` (DDD) și de
 * `tyre_message_log` (Cauciucuri). Vezi migrația 005 (`carpet_message_logs`).
 */
export class CarpetMessageRepository {
  constructor(private db: Db) {}

  insertLog(data: CarpetMessageInsert): void {
    this.db.run(
      `INSERT INTO carpet_message_logs (client_id, channel, recipient, message_preview, status)
       VALUES (?, 'whatsapp', ?, ?, 'prepared')`,
      data.client_id,
      data.recipient,
      data.message_preview,
    );
  }

  list(filter: CarpetMessageListFilter): Paginated<CarpetMessageLogItem> {
    const total =
      this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM carpet_message_logs')?.n ?? 0;

    const items = this.db.all<CarpetMessageLogItem>(
      `
      SELECT m.id, m.client_id, c.name AS client_name, m.channel, m.recipient,
        m.message_preview, m.status, m.created_at
      FROM carpet_message_logs m
      LEFT JOIN carpet_clients c ON c.id = m.client_id
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ? OFFSET ?
      `,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
