import type { Db } from '../database';
import type { Contact, ContactCreate, ContactUpdate } from '../../../shared/schemas/contact';

interface ContactRow
  extends Omit<
    Contact,
    'is_primary' | 'allow_whatsapp' | 'allow_email' | 'allow_sms' | 'do_not_contact'
  > {
  is_primary: number;
  allow_whatsapp: number;
  allow_email: number;
  allow_sms: number;
  do_not_contact: number;
}

function toContact(row: ContactRow): Contact {
  return {
    ...row,
    is_primary: !!row.is_primary,
    allow_whatsapp: !!row.allow_whatsapp,
    allow_email: !!row.allow_email,
    allow_sms: !!row.allow_sms,
    do_not_contact: !!row.do_not_contact,
  };
}

export class ContactRepository {
  constructor(private db: Db) {}

  listByAssociation(associationId: number): Contact[] {
    return this.db
      .all<ContactRow>(
        `SELECT * FROM contacts
         WHERE association_id = ? AND deleted_at IS NULL
         ORDER BY is_primary DESC, name COLLATE NOCASE`,
        associationId,
      )
      .map(toContact);
  }

  getById(id: number): Contact | undefined {
    const row = this.db.get<ContactRow>(
      'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    return row ? toContact(row) : undefined;
  }

  /** Contactul principal al asociației (sau primul disponibil). */
  getPrimaryForAssociation(associationId: number): Contact | undefined {
    const row = this.db.get<ContactRow>(
      `SELECT * FROM contacts
       WHERE association_id = ? AND deleted_at IS NULL
       ORDER BY is_primary DESC, id LIMIT 1`,
      associationId,
    );
    return row ? toContact(row) : undefined;
  }

  create(data: ContactCreate): Contact {
    return this.db.transaction(() => {
      if (data.is_primary) this.clearPrimary(data.association_id);
      const result = this.db.run(
        `INSERT INTO contacts
          (association_id, name, role, phone, email, preferred_channel, is_primary,
           allow_whatsapp, allow_email, allow_sms, do_not_contact, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        data.association_id,
        data.name,
        data.role,
        data.phone,
        data.email,
        data.preferred_channel,
        data.is_primary ? 1 : 0,
        data.allow_whatsapp ? 1 : 0,
        data.allow_email ? 1 : 0,
        data.allow_sms ? 1 : 0,
        data.do_not_contact ? 1 : 0,
        data.notes,
      );
      return this.getById(Number(result.lastInsertRowid))!;
    });
  }

  update(data: ContactUpdate): Contact {
    return this.db.transaction(() => {
      if (data.is_primary) this.clearPrimary(data.association_id, data.id);
      this.db.run(
        `UPDATE contacts
         SET name = ?, role = ?, phone = ?, email = ?, preferred_channel = ?, is_primary = ?,
             allow_whatsapp = ?, allow_email = ?, allow_sms = ?, do_not_contact = ?, notes = ?,
             updated_at = datetime('now')
         WHERE id = ? AND deleted_at IS NULL`,
        data.name,
        data.role,
        data.phone,
        data.email,
        data.preferred_channel,
        data.is_primary ? 1 : 0,
        data.allow_whatsapp ? 1 : 0,
        data.allow_email ? 1 : 0,
        data.allow_sms ? 1 : 0,
        data.do_not_contact ? 1 : 0,
        data.notes,
        data.id,
      );
      return this.getById(data.id)!;
    });
  }

  /** Soft-delete: contactul rămâne pentru istoric mesaje. */
  softDelete(id: number): void {
    this.db.run(
      `UPDATE contacts SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      id,
    );
  }

  private clearPrimary(associationId: number, exceptId?: number): void {
    this.db.run(
      `UPDATE contacts SET is_primary = 0 WHERE association_id = ? AND id != ?`,
      associationId,
      exceptId ?? -1,
    );
  }
}
