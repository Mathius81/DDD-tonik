import type { Db } from '../database';
import type {
  MessageLog,
  MessageLogFilter,
  MessageLogListItem,
  MessageStatus,
  MessageTemplate,
  MessageTemplateCreate,
  MessageTemplateUpdate,
} from '../../../shared/schemas/message';
import type { Paginated } from '../../../shared/schemas/common';

interface TemplateRow extends Omit<MessageTemplate, 'active'> {
  active: number;
}

export class MessageRepository {
  constructor(private db: Db) {}

  // --- Templates ---

  listTemplates(): MessageTemplate[] {
    return this.db
      .all<TemplateRow>('SELECT * FROM message_templates ORDER BY channel, name')
      .map((r) => ({ ...r, active: !!r.active }));
  }

  getTemplate(id: number): MessageTemplate | undefined {
    const row = this.db.get<TemplateRow>('SELECT * FROM message_templates WHERE id = ?', id);
    return row ? { ...row, active: !!row.active } : undefined;
  }

  getActiveTemplateForChannel(channel: string): MessageTemplate | undefined {
    const row = this.db.get<TemplateRow>(
      'SELECT * FROM message_templates WHERE channel = ? AND active = 1 ORDER BY id LIMIT 1',
      channel,
    );
    return row ? { ...row, active: !!row.active } : undefined;
  }

  createTemplate(data: MessageTemplateCreate): MessageTemplate {
    const result = this.db.run(
      'INSERT INTO message_templates (name, channel, subject, body) VALUES (?, ?, ?, ?)',
      data.name,
      data.channel,
      data.subject,
      data.body,
    );
    return this.getTemplate(Number(result.lastInsertRowid))!;
  }

  updateTemplate(data: MessageTemplateUpdate): MessageTemplate {
    this.db.run(
      `UPDATE message_templates
       SET name = ?, channel = ?, subject = ?, body = ?, active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      data.name,
      data.channel,
      data.subject,
      data.body,
      data.active ? 1 : 0,
      data.id,
    );
    return this.getTemplate(data.id)!;
  }

  // --- Message log ---

  getLog(id: number): MessageLog | undefined {
    return this.db.get<MessageLog>('SELECT * FROM message_logs WHERE id = ?', id);
  }

  insertLog(data: {
    association_id: number | null;
    contact_id: number | null;
    followup_id: number | null;
    reminder_id: number | null;
    channel: string;
    recipient: string;
    template_id: number | null;
    message_preview: string;
    status: MessageStatus;
    provider_message_id?: string | null;
    error_message?: string | null;
  }): MessageLog {
    const result = this.db.run(
      `INSERT INTO message_logs
        (association_id, contact_id, followup_id, reminder_id, channel, recipient,
         template_id, message_preview, provider_message_id, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN ? IN ('accepted_by_provider','confirmed_sent') THEN datetime('now') ELSE NULL END)`,
      data.association_id,
      data.contact_id,
      data.followup_id,
      data.reminder_id,
      data.channel,
      data.recipient,
      data.template_id,
      data.message_preview,
      data.provider_message_id ?? null,
      data.status,
      data.error_message ?? null,
      data.status,
    );
    return this.getLog(Number(result.lastInsertRowid))!;
  }

  setLogStatus(id: number, status: MessageStatus, errorMessage?: string | null): void {
    this.db.run(
      `UPDATE message_logs
       SET status = ?, error_message = ?,
           sent_at = CASE WHEN ? IN ('accepted_by_provider','confirmed_sent') THEN datetime('now') ELSE sent_at END
       WHERE id = ?`,
      status,
      errorMessage ?? null,
      status,
      id,
    );
  }

  /** Contoare pentru tab-urile din pagina Mesaje. */
  statusCounts(): { all: number; prepared: number; failed: number } {
    const q = (sql: string) => this.db.get<{ n: number }>(sql)?.n ?? 0;
    return {
      all: q('SELECT COUNT(*) AS n FROM message_logs'),
      prepared: q(`SELECT COUNT(*) AS n FROM message_logs WHERE status IN ('prepared','opened')`),
      failed: q(`SELECT COUNT(*) AS n FROM message_logs WHERE status = 'failed'`),
    };
  }

  countFailed(): number {
    return (
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM message_logs WHERE status = 'failed'`)
        ?.n ?? 0
    );
  }

  listLogs(filter: MessageLogFilter): Paginated<MessageLogListItem> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.association_id) {
      where.push('m.association_id = ?');
      params.push(filter.association_id);
    }
    if (filter.status !== 'all') {
      where.push('m.status = ?');
      params.push(filter.status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM message_logs m ${whereSql}`, ...params)
        ?.n ?? 0;

    const rows = this.db.all<MessageLogListItem>(
      `SELECT m.*, a.name AS association_name, c.name AS contact_name
       FROM message_logs m
       LEFT JOIN associations a ON a.id = m.association_id
       LEFT JOIN contacts c ON c.id = m.contact_id
       ${whereSql}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      ...params,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    );

    return { items: rows, total, page: filter.page, pageSize: filter.pageSize };
  }
}
