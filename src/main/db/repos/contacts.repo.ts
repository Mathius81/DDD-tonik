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
  AdministratorAssociationSummary,
  AdministratorGroup,
  Contact,
  ContactCreate,
  ContactUpdate,
} from '../../../shared/schemas/contact';
import { normalizePhoneE164 } from '../../services/messaging/template-render';

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

  // ---------- Administratori cu mai multe asociații ----------
  //
  // Un administrator care are mai multe asociații e, în modelul actual, mai multe rânduri
  // `contacts` separate (câte unul per asociație) cu, de regulă, același telefon. Grupele
  // de mai jos se calculează AICI, la citire, după telefonul normalizat — NU se schimbă
  // nimic în schemă și nu se scrie nimic nou în bază. Contactele fără telefon sau cu un
  // telefon care nu poate fi normalizat rămân în afara oricărui grup (comparate sigur
  // doar pe bază de telefon, niciodată pe nume).

  /**
   * Calculează TOATE grupurile (inclusiv cele cu o singură asociație) — apelanții publici
   * filtrează după nevoie. E recalculat la fiecare apel (fără cache): pentru câteva sute
   * de contacte, într-o aplicație locală, costul e neglijabil față de complexitatea unui
   * cache invalidat corect.
   */
  private computeAdministratorGroups(todayIso: string): AdministratorGroup[] {
    interface Row {
      contact_id: number;
      name: string;
      phone: string;
      updated_at: string;
      association_id: number;
      association_name: string;
      association_active: number;
    }
    const rows = this.db.all<Row>(
      `SELECT c.id AS contact_id, c.name, c.phone, c.updated_at,
              a.id AS association_id, a.name AS association_name, a.active AS association_active
       FROM contacts c
       JOIN associations a ON a.id = c.association_id
       WHERE c.deleted_at IS NULL AND c.phone IS NOT NULL AND c.phone != ''
       ORDER BY c.updated_at DESC, c.id DESC`,
    );

    // Grupare pe telefon normalizat (E.164 fără '+'); formatele diferite (0722…,
    // +40722…, 0040722…, cu spații) devin aceeași cheie.
    const byPhone = new Map<string, Row[]>();
    for (const row of rows) {
      const normalized = normalizePhoneE164(row.phone);
      if (!normalized) continue; // telefon nevalid — nu poate fi comparat sigur
      const list = byPhone.get(normalized);
      if (list) list.push(row);
      else byPhone.set(normalized, [row]);
    }

    // O singură interogare pentru follow-up-urile TUTUROR asociațiilor implicate, în loc
    // de una per asociație (evită N+1 pe grupuri mari).
    const associationIds = new Set<number>();
    for (const list of byPhone.values()) {
      for (const row of list) associationIds.add(row.association_id);
    }
    const followupsByAssociation = new Map<number, { service_name: string; due_date: string }[]>();
    if (associationIds.size > 0) {
      const ids = [...associationIds];
      const placeholders = ids.map(() => '?').join(',');
      const followupRows = this.db.all<{
        association_id: number;
        service_name: string;
        due_date: string;
      }>(
        `SELECT f.association_id, s.name AS service_name, f.due_date
         FROM followups f
         JOIN services s ON s.id = f.service_id
         WHERE f.association_id IN (${placeholders}) AND f.status IN ('pending','contacted','scheduled')
         ORDER BY f.due_date`,
        ...ids,
      );
      for (const fr of followupRows) {
        const list = followupsByAssociation.get(fr.association_id);
        const entry = { service_name: fr.service_name, due_date: fr.due_date };
        if (list) list.push(entry);
        else followupsByAssociation.set(fr.association_id, [entry]);
      }
    }

    const groups: AdministratorGroup[] = [];
    for (const [phone, contactsForPhone] of byPhone) {
      // rows sunt ORDER BY updated_at DESC — primul rând per asociație e contactul cel
      // mai recent actualizat de la acea asociație cu acest telefon.
      const byAssociation = new Map<number, Row>();
      for (const row of contactsForPhone) {
        if (!byAssociation.has(row.association_id)) byAssociation.set(row.association_id, row);
      }

      const associations: AdministratorAssociationSummary[] = [...byAssociation.values()]
        .map((row): AdministratorAssociationSummary => {
          const openFollowups = (followupsByAssociation.get(row.association_id) ?? []).map((f) => ({
            service_name: f.service_name,
            due_date: f.due_date,
            overdue: f.due_date < todayIso,
          }));
          return {
            association_id: row.association_id,
            association_name: row.association_name,
            association_active: !!row.association_active,
            contact_id: row.contact_id,
            open_followups: openFollowups,
          };
        })
        .sort((a, b) => a.association_name.localeCompare(b.association_name, 'ro'));

      const names = [...new Set(contactsForPhone.map((row) => row.name))];

      groups.push({
        phone,
        // contactsForPhone[0] = cel mai recent actualizat contact cu acest telefon (global).
        phone_display: contactsForPhone[0].phone,
        display_name: contactsForPhone[0].name,
        names,
        associations,
        associations_count: associations.length,
        overdue_count: associations.filter((a) => a.open_followups.some((f) => f.overdue)).length,
        upcoming_count: associations.filter(
          (a) => a.open_followups.length > 0 && !a.open_followups.some((f) => f.overdue),
        ).length,
        ok_count: associations.filter((a) => a.open_followups.length === 0).length,
      });
    }

    return groups;
  }

  /**
   * Toți administratorii, grupați după telefon — pagina „Administratori”.
   * Îi include și pe cei cu o singură asociație: pagina e o listă de lucru, nu
   * doar cazul special al celor cu mai multe. Gruparea într-un singur mesaj are
   * sens doar de la două asociații în sus, dar asta se vede în coloana „Asociații”.
   * Ordinea: cei cu restanțe primii, apoi alfabetic.
   */
  listAdministratorGroups(todayIso: string): AdministratorGroup[] {
    return this.computeAdministratorGroups(todayIso)
      .sort(
        (a, b) => b.overdue_count - a.overdue_count || a.display_name.localeCompare(b.display_name, 'ro'),
      );
  }

  /** Situația completă a unei persoane, identificată după telefon (orice format acceptat). */
  getAdministratorGroupByPhone(rawPhone: string, todayIso: string): AdministratorGroup | undefined {
    const normalized = normalizePhoneE164(rawPhone);
    if (!normalized) return undefined;
    return this.computeAdministratorGroups(todayIso).find((g) => g.phone === normalized);
  }

  /**
   * Grupurile pentru un set de telefoane brute (ex. cele afișate pe pagina curentă de
   * Remindere sau contactele unei asociații) — o singură trecere prin date, mapate 1:1 pe
   * telefonul primit ca cheie (indiferent de format). Telefoanele care nu se potrivesc
   * niciunui contact valid lipsesc din rezultat.
   */
  getAdministratorGroupsForPhones(
    rawPhones: string[],
    todayIso: string,
  ): Record<string, AdministratorGroup> {
    const groups = this.computeAdministratorGroups(todayIso);
    const byNormalized = new Map(groups.map((g) => [g.phone, g] as const));
    const result: Record<string, AdministratorGroup> = {};
    for (const raw of rawPhones) {
      const normalized = normalizePhoneE164(raw);
      if (!normalized) continue;
      const group = byNormalized.get(normalized);
      if (group) result[raw] = group;
    }
    return result;
  }
}
