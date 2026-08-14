import type { Migration } from './index';

export const migration001: Migration = {
  version: 1,
  name: 'initial',
  up(db) {
    db.exec(`
      CREATE TABLE associations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tax_id TEXT,
        address TEXT NOT NULL,
        city TEXT,
        county TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        association_id INTEGER NOT NULL REFERENCES associations(id),
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Administrator',
        phone TEXT,
        email TEXT,
        preferred_channel TEXT NOT NULL DEFAULT 'whatsapp',
        is_primary INTEGER NOT NULL DEFAULT 0,
        allow_whatsapp INTEGER NOT NULL DEFAULT 1,
        allow_email INTEGER NOT NULL DEFAULT 1,
        allow_sms INTEGER NOT NULL DEFAULT 0,
        do_not_contact INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_contacts_association ON contacts(association_id);
      CREATE INDEX idx_contacts_phone ON contacts(phone);

      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        default_interval_months INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE interventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        association_id INTEGER NOT NULL REFERENCES associations(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        performed_date TEXT NOT NULL,
        interval_months INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_interventions_association ON interventions(association_id, performed_date);
      CREATE INDEX idx_interventions_service ON interventions(service_id);

      CREATE TABLE followups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        association_id INTEGER NOT NULL REFERENCES associations(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        source_intervention_id INTEGER REFERENCES interventions(id),
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','contacted','scheduled','completed','cancelled')),
        scheduled_date TEXT,
        scheduled_time TEXT,
        contacted_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_followups_status_due ON followups(status, due_date);
      CREATE INDEX idx_followups_association ON followups(association_id);
      CREATE INDEX idx_followups_scheduled ON followups(scheduled_date);

      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        followup_id INTEGER NOT NULL REFERENCES followups(id),
        offset_days INTEGER NOT NULL,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','internal')),
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','processing','sent','failed','cancelled','skipped')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        sent_at TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(followup_id, offset_days, channel)
      );
      CREATE INDEX idx_reminders_status_scheduled ON reminders(status, scheduled_at);

      CREATE TABLE message_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
        subject TEXT,
        body TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE message_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        association_id INTEGER REFERENCES associations(id),
        contact_id INTEGER REFERENCES contacts(id),
        followup_id INTEGER REFERENCES followups(id),
        reminder_id INTEGER REFERENCES reminders(id),
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
        recipient TEXT NOT NULL,
        template_id INTEGER REFERENCES message_templates(id),
        message_preview TEXT NOT NULL,
        provider_message_id TEXT,
        status TEXT NOT NULL
          CHECK (status IN ('prepared','opened','confirmed_sent','accepted_by_provider','failed')),
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at TEXT
      );
      CREATE INDEX idx_message_logs_association ON message_logs(association_id);
      CREATE INDEX idx_message_logs_status ON message_logs(status);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Servicii inițiale — utilizatorul le poate modifica/dezactiva din Setări.
    db.exec(`
      INSERT INTO services (name, default_interval_months) VALUES
        ('Dezinsecție', 3),
        ('Deratizare', 3),
        ('Dezinfecție', 6);
    `);

    // Template implicit WhatsApp în română.
    db.run(
      `INSERT INTO message_templates (name, channel, subject, body) VALUES (?, 'whatsapp', NULL, ?)`,
      'Reminder standard WhatsApp',
      [
        'Bună ziua, {{contact_name}}.',
        '',
        'Vă informăm că se apropie perioada recomandată pentru serviciul de {{service_name}} la {{association_name}}.',
        '',
        'Data următoarei intervenții: {{due_date}}',
        '',
        'Pentru programare ne puteți contacta la {{company_phone}}.',
        '',
        '{{company_name}}',
      ].join('\n'),
    );
    db.run(
      `INSERT INTO message_templates (name, channel, subject, body) VALUES (?, 'email', ?, ?)`,
      'Reminder standard Email',
      'Programare {{service_name}} – {{association_name}}',
      [
        'Stimate/Stimată {{contact_name}},',
        '',
        'Vă informăm că, potrivit graficului de intervenții, se apropie termenul recomandat pentru efectuarea serviciului de {{service_name}} la {{association_name}}.',
        '',
        'Data recomandată a următoarei intervenții: {{due_date}}',
        '',
        'Pentru stabilirea unei programări, vă rugăm să ne contactați la {{company_phone}} sau să răspundeți acestui mesaj.',
        '',
        'Vă mulțumim pentru colaborare.',
        '',
        'Cu deosebită considerație,',
        '{{company_name}}',
      ].join('\n'),
    );
  },
};
