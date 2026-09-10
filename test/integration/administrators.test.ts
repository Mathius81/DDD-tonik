/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { ContactRepository } from '../../src/main/db/repos/contacts.repo';
import { formatRo } from '../../src/shared/dates';
import type { AdministratorGroup } from '../../src/shared/schemas/contact';

const TODAY = '2026-09-09';

function seedAssociation(db: Db, name: string): number {
  const r = db.run(`INSERT INTO associations (name, address) VALUES (?, ?)`, name, 'Str. Test 1');
  return Number(r.lastInsertRowid);
}

function seedContact(db: Db, associationId: number, name: string, phone: string | null): number {
  const r = db.run(
    `INSERT INTO contacts (association_id, name, role, phone) VALUES (?, ?, 'Administrator', ?)`,
    associationId,
    name,
    phone,
  );
  return Number(r.lastInsertRowid);
}

function touch(db: Db, contactId: number, updatedAt: string): void {
  db.run(`UPDATE contacts SET updated_at = ? WHERE id = ?`, updatedAt, contactId);
}

function serviceId(db: Db, name: string): number {
  return db.get<{ id: number }>(`SELECT id FROM services WHERE name = ?`, name)!.id;
}

function seedFollowup(
  db: Db,
  associationId: number,
  serviceIdVal: number,
  dueDate: string,
  status = 'pending',
): void {
  db.run(
    `INSERT INTO followups (association_id, service_id, due_date, status) VALUES (?, ?, ?, ?)`,
    associationId,
    serviceIdVal,
    dueDate,
    status,
  );
}

function seedIntervention(
  db: Db,
  associationId: number,
  serviceIdVal: number,
  performedDate: string,
): void {
  db.run(
    `INSERT INTO interventions (association_id, service_id, performed_date, interval_months)
     VALUES (?, ?, ?, 3)`,
    associationId,
    serviceIdVal,
    performedDate,
  );
}

describe('ContactRepository — grupare administratori după telefon (spec: identificare automată, fără migrare de date)', () => {
  let db: Db;
  let cleanup: () => void;
  let repo: ContactRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    repo = new ContactRepository(db);
  });

  afterEach(() => cleanup());

  it('grupează contacte cu telefon în formate diferite (0722…, +40722…) ca fiind aceeași persoană', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    seedContact(db, a1, 'Ion Popescu', '0722111222');
    seedContact(db, a2, 'Popescu Ion', '+40722111222');

    const groups = repo.listAdministratorGroups(TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].associations_count).toBe(2);
    // Numele pot diferi ușor între înregistrări — telefonul e cheia, nu numele; ambele
    // variante trebuie păstrate ca să vadă utilizatorul că e aceeași persoană.
    expect([...groups[0].names].sort()).toEqual(['Ion Popescu', 'Popescu Ion']);
  });

  it('recunoaște și formatul 0040… și telefonul cu spații ca fiind același număr', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    seedContact(db, a1, 'Ion Popescu', '0040722111222');
    seedContact(db, a2, 'Ion Popescu', '+40 722 111 222');

    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY);
    expect(group).toBeDefined();
    expect(group!.associations_count).toBe(2);
    expect(group!.phone).toBe('40722111222');
  });

  it('afișează numele contactului cel mai recent actualizat, dar păstrează ambele variante', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    const c1 = seedContact(db, a1, 'Ion Popescu', '0722111222');
    const c2 = seedContact(db, a2, 'Popescu Ion', '0722111222');
    touch(db, c1, '2026-09-01 10:00:00');
    touch(db, c2, '2026-09-05 10:00:00'); // cel mai recent

    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY);
    expect(group!.display_name).toBe('Popescu Ion');
    expect([...group!.names].sort()).toEqual(['Ion Popescu', 'Popescu Ion']);
  });

  it('contactele fără telefon rămân individuale — nu sunt grupate cu nimic', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    const a3 = seedAssociation(db, 'Bloc C7');
    seedContact(db, a1, 'Ion Popescu', '0722111222');
    seedContact(db, a2, 'Ion Popescu', '0722111222');
    seedContact(db, a3, 'Fără Telefon', null);

    // Contactul fără telefon nu trebuie să apară în niciun grup și nu trebuie să
    // strice calculul grupului real (Ion Popescu, 2 asociații).
    const groups = repo.listAdministratorGroups(TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].associations_count).toBe(2);
    expect(groups[0].associations.some((a) => a.association_id === a3)).toBe(false);
  });

  it('o persoană cu o SINGURĂ asociație apare și ea în listă (pagina e o listă de lucru completă)', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    seedContact(db, a1, 'Maria Ionescu', '0733222333');

    const groups = repo.listAdministratorGroups(TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].display_name).toBe('Maria Ionescu');
    expect(groups[0].associations_count).toBe(1);

    // Numărul de asociații rămâne disponibil: UI-ul decide pe baza lui dacă are
    // sens butonul „trimite situația completă” (are sens de la două în sus).
    const direct = repo.getAdministratorGroupByPhone('0733222333', TODAY);
    expect(direct).toBeDefined();
    expect(direct!.associations_count).toBe(1);
  });

  it('îi listează împreună pe cei cu una și pe cei cu mai multe asociații', () => {
    const a1 = seedAssociation(db, 'Bloc Singur');
    const a2 = seedAssociation(db, 'Bloc Doi A');
    const a3 = seedAssociation(db, 'Bloc Doi B');
    seedContact(db, a1, 'Maria Ionescu', '0733222333');
    seedContact(db, a2, 'Ion Popescu', '0722111222');
    seedContact(db, a3, 'Ion Popescu', '0722111222');

    const groups = repo.listAdministratorGroups(TODAY);
    expect(groups).toHaveLength(2);
    const dupaNume = Object.fromEntries(groups.map((g) => [g.display_name, g.associations_count]));
    expect(dupaNume).toEqual({ 'Maria Ionescu': 1, 'Ion Popescu': 2 });
  });

  it('calculează corect restante / scadente / la zi pentru fiecare asociație a grupului', () => {
    const overdue = seedAssociation(db, 'Bloc Restant');
    const upcoming = seedAssociation(db, 'Bloc Scadent');
    const ok = seedAssociation(db, 'Bloc La Zi');
    seedContact(db, overdue, 'Ion Popescu', '0722111222');
    seedContact(db, upcoming, 'Ion Popescu', '0722111222');
    seedContact(db, ok, 'Ion Popescu', '0722111222');

    const deratizare = serviceId(db, 'Deratizare');
    seedFollowup(db, overdue, deratizare, '2026-08-01'); // înainte de TODAY → restantă
    seedFollowup(db, upcoming, deratizare, '2026-10-15'); // după TODAY → scadentă
    // `ok` nu are niciun follow-up deschis → la zi

    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY)!;
    expect(group.associations_count).toBe(3);
    expect(group.overdue_count).toBe(1);
    expect(group.upcoming_count).toBe(1);
    expect(group.ok_count).toBe(1);

    const byName = new Map(group.associations.map((a) => [a.association_name, a]));
    expect(byName.get('Bloc Restant')!.open_followups[0].overdue).toBe(true);
    expect(byName.get('Bloc Scadent')!.open_followups[0].overdue).toBe(false);
    expect(byName.get('Bloc La Zi')!.open_followups).toEqual([]);
  });

  it('calculează ultima intervenție per (asociație, serviciu) — MAX(performed_date), nu ultima inserată', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    seedContact(db, a1, 'Ion Popescu', '0722111222');

    const deratizare = serviceId(db, 'Deratizare');
    const dezinsectie = serviceId(db, 'Dezinsecție');

    // Inserate în ordine „greșită” (cea mai veche ultima) — MAX(performed_date) trebuie să
    // aleagă corect data cea mai recentă, nu ultimul rând inserat.
    seedIntervention(db, a1, deratizare, '2026-01-10');
    seedIntervention(db, a1, deratizare, '2026-03-12'); // cea mai recentă pentru Deratizare
    seedIntervention(db, a1, deratizare, '2026-02-01');
    seedIntervention(db, a1, dezinsectie, '2026-08-20'); // singura pentru Dezinsecție

    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY)!;
    const a = group.associations[0];
    const byService = new Map(a.last_interventions.map((li) => [li.service_name, li.last_performed_date]));
    expect(byService.get('Deratizare')).toBe('2026-03-12');
    expect(byService.get('Dezinsecție')).toBe('2026-08-20');
    expect(a.last_interventions).toHaveLength(2); // câte un rând per serviciu distinct, nu per intervenție
  });

  it('o asociație abia introdusă, fără nicio intervenție, întoarce last_interventions gol', () => {
    const a1 = seedAssociation(db, 'Bloc Nou');
    seedContact(db, a1, 'Ion Popescu', '0722111222');

    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY)!;
    expect(group.associations[0].last_interventions).toEqual([]);
  });

  it('NU face o interogare per asociație pentru istoricul de intervenții (batched, nu N+1)', () => {
    // 5 asociații ale aceluiași administrator, fiecare cu intervenții pe servicii diferite —
    // numărul de interogări SQL nu trebuie să crească proporțional cu numărul de asociații.
    const deratizare = serviceId(db, 'Deratizare');
    const associationIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const id = seedAssociation(db, `Bloc ${i}`);
      seedContact(db, id, 'Ion Popescu', '0722111222');
      seedIntervention(db, id, deratizare, '2026-01-01');
      associationIds.push(id);
    }

    const spy = vi.spyOn(db, 'all');
    const group = repo.getAdministratorGroupByPhone('0722111222', TODAY)!;
    expect(group.associations_count).toBe(5);

    // Interogări așteptate, indiferent de numărul de asociații: contacte, follow-up-uri
    // (IN batched), intervenții (IN batched) — un număr FIX, nu unul care crește cu N.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    spy.mockRestore();
  });

  it('getAdministratorGroupsForPhones mapează rezultatul după telefonul BRUT primit, indiferent de format', () => {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    seedContact(db, a1, 'Ion Popescu', '0722111222');
    seedContact(db, a2, 'Ion Popescu', '0722111222');

    const result = repo.getAdministratorGroupsForPhones(
      ['0722111222', '+40 722 111 222', '0799999999', ''],
      TODAY,
    );
    expect(Object.keys(result).sort()).toEqual(['+40 722 111 222', '0722111222'].sort());
    expect(result['0722111222'].associations_count).toBe(2);
    expect(result['+40 722 111 222'].associations_count).toBe(2);
  });
});

// ---------- Handlere IPC + textul agregat ----------
//
// `administrators.ipc.ts` importă `shell` din `electron` (mod asistat: deschide wa.me) și
// `handle()` din `register.ts`, care înregistrează prin `ipcMain.handle`. Mock minimal, ca în
// `test/unit/about.test.ts`.

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, fn);
      }),
    },
    shell: { openExternal: vi.fn(async () => undefined) },
  };
});

vi.mock('electron', () => ({
  ipcMain: electronMock.ipcMain,
  shell: electronMock.shell,
}));

import { shell } from 'electron';
import { AppContext } from '../../src/main/app-context';
import {
  registerAdministratorHandlers,
  buildAdministratorSituationMessage,
} from '../../src/main/ipc/administrators.ipc';
import { IPC } from '../../src/shared/ipc-contract';
import type { IpcResult } from '../../src/shared/ipc-contract';
import type { AppPaths } from '../../src/main/paths';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('buildAdministratorSituationMessage — text agregat (toate asociațiile, inclusiv cele la zi)', () => {
  const group: AdministratorGroup = {
    phone: '40722111222',
    phone_display: '0722111222',
    display_name: 'Ion Popescu',
    do_not_contact: false,
    names: ['Ion Popescu'],
    associations: [
      {
        association_id: 1,
        association_name: 'Bloc A1',
        association_active: true,
        contact_id: 10,
        open_followups: [{ service_name: 'Deratizare', due_date: '2026-08-01', overdue: true }],
        last_interventions: [], // asociație abia introdusă — nicio intervenție încă
      },
      {
        association_id: 2,
        association_name: 'Bloc B3',
        association_active: true,
        contact_id: 20,
        open_followups: [{ service_name: 'Dezinsecție', due_date: '2026-10-20', overdue: false }],
        last_interventions: [],
      },
      {
        association_id: 3,
        association_name: 'Bloc C7',
        association_active: true,
        contact_id: 30,
        open_followups: [],
        last_interventions: [],
      },
    ],
    associations_count: 3,
    overdue_count: 1,
    upcoming_count: 1,
    ok_count: 1,
  };

  it('include toate asociațiile, marcând explicit restantele, scadențele și cele la zi', () => {
    const text = buildAdministratorSituationMessage(group, '0722000000', 'Firma Test SRL');

    expect(text).toContain('Bună ziua, Ion Popescu.');
    expect(text).toContain(`• Bloc A1 — Deratizare, restantă din ${formatRo('2026-08-01')}`);
    expect(text).toContain(`• Bloc B3 — Dezinsecție, scadentă ${formatRo('2026-10-20')}`);
    expect(text).toContain('• Bloc C7 — la zi');
    expect(text).toContain('Pentru programare ne puteți contacta la 0722000000.');
    expect(text).toContain('Firma Test SRL');
  });

  it('omite rândul cu numele firmei dacă nu e completat în Setări', () => {
    const text = buildAdministratorSituationMessage(group, '0722000000', '');
    expect(text.trim().endsWith('Pentru programare ne puteți contacta la 0722000000.')).toBe(true);
  });
});

describe('buildAdministratorSituationMessage — și ce s-a făcut, nu doar ce urmează (cerința clientului)', () => {
  const groupWithHistory: AdministratorGroup = {
    phone: '40722111222',
    phone_display: '0722111222',
    display_name: 'Ion Popescu',
    do_not_contact: false,
    names: ['Ion Popescu'],
    associations: [
      {
        // Serviciu cu istoric ȘI urmărire deschisă → „făcută X, scadentă/restantă Y” pe același rând.
        association_id: 1,
        association_name: 'Bloc A1',
        association_active: true,
        contact_id: 10,
        open_followups: [{ service_name: 'Deratizare', due_date: '2026-10-15', overdue: false }],
        last_interventions: [{ service_name: 'Deratizare', last_performed_date: '2026-03-12' }],
      },
      {
        // Complet la zi, dar cu istoric → menționăm scurt ultima intervenție, nu doar „la zi”.
        association_id: 2,
        association_name: 'Bloc C7',
        association_active: true,
        contact_id: 20,
        open_followups: [],
        last_interventions: [{ service_name: 'Dezinsecție', last_performed_date: '2026-08-20' }],
      },
    ],
    associations_count: 2,
    overdue_count: 0,
    upcoming_count: 1,
    ok_count: 1,
  };

  it('combină, per serviciu, ultima intervenție cu următoarea scadență', () => {
    const text = buildAdministratorSituationMessage(groupWithHistory, '0722000000', 'Firma Test SRL');
    expect(text).toContain(
      `• Bloc A1 — Deratizare făcută ${formatRo('2026-03-12')}, scadentă ${formatRo('2026-10-15')}`,
    );
  });

  it('pentru o asociație la zi cu istoric arată scurt ultima intervenție, nu doar „la zi”', () => {
    const text = buildAdministratorSituationMessage(groupWithHistory, '0722000000', 'Firma Test SRL');
    expect(text).toContain(`• Bloc C7 — la zi (ultima: Dezinsecție ${formatRo('2026-08-20')})`);
  });

  it('pentru o asociație la zi FĂRĂ istoric (abia introdusă) rămâne „la zi”, fără paranteză', () => {
    const brandNew: AdministratorGroup = {
      ...groupWithHistory,
      associations: [
        {
          association_id: 3,
          association_name: 'Bloc Nou',
          association_active: true,
          contact_id: 30,
          open_followups: [],
          last_interventions: [],
        },
      ],
    };
    const text = buildAdministratorSituationMessage(brandNew, '0722000000', 'Firma Test SRL');
    expect(text).toContain('• Bloc Nou — la zi');
    expect(text).not.toContain('Bloc Nou — la zi (ultima');
  });

  it('cu mai multe servicii scadente, arată doar „făcută” pentru cel cu istoric, restul rămân neschimbate', () => {
    const mixed: AdministratorGroup = {
      ...groupWithHistory,
      associations: [
        {
          association_id: 4,
          association_name: 'Bloc Mixt',
          association_active: true,
          contact_id: 40,
          open_followups: [
            { service_name: 'Deratizare', due_date: '2026-10-15', overdue: false },
            { service_name: 'Dezinfecție', due_date: '2026-09-01', overdue: true },
          ],
          last_interventions: [{ service_name: 'Deratizare', last_performed_date: '2026-03-12' }],
        },
      ],
    };
    const text = buildAdministratorSituationMessage(mixed, '0722000000', 'Firma Test SRL');
    expect(text).toContain(
      `Deratizare făcută ${formatRo('2026-03-12')}, scadentă ${formatRo('2026-10-15')}`,
    );
    expect(text).toContain(`Dezinfecție, restantă din ${formatRo('2026-09-01')}`);
  });
});

describe('administrators.ipc — handlere', () => {
  let db: Db;
  let cleanup: () => void;
  let ctx: AppContext;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;

    const paths: AppPaths = {
      dataDir: '/tmp/nu-se-foloseste',
      backupsDir: '/tmp/nu-se-foloseste/backups',
      logsDir: '/tmp/nu-se-foloseste/logs',
      dbFile: '/tmp/nu-se-foloseste/data/ddd-manager.sqlite',
    };
    ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date(`${TODAY}T09:00:00`));

    ctx.settings.save({
      ...ctx.settings.get(),
      company: { ...ctx.settings.get().company, name: 'Firma Test SRL', phone: '0722000000' },
    });

    electronMock.handlers.clear();
    vi.mocked(shell.openExternal).mockClear();
    registerAdministratorHandlers(ctx);
  });

  afterEach(() => cleanup());

  async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const fn = electronMock.handlers.get(channel);
    if (!fn) throw new Error(`Handler neînregistrat: ${channel}`);
    return (await fn({}, payload)) as IpcResult<T>;
  }

  function seed() {
    const a1 = seedAssociation(db, 'Bloc A1');
    const a2 = seedAssociation(db, 'Bloc B3');
    const c1 = seedContact(db, a1, 'Ion Popescu', '0722111222');
    const c2 = seedContact(db, a2, 'Ion Popescu', '0722111222');
    return { a1, a2, c1, c2 };
  }

  it('administrators:list întoarce doar persoanele cu mai mult de o asociație', async () => {
    seed();
    seedAssociation(db, 'Bloc Singur'); // fără contact — nu afectează
    const result = await invoke<AdministratorGroup[]>(IPC.administrators.list);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].associations_count).toBe(2);
  });

  it('administrators:getByPhones mapează după telefonul brut trimis', async () => {
    seed();
    const result = await invoke<Record<string, AdministratorGroup>>(IPC.administrators.getByPhones, {
      phones: ['0722111222'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data['0722111222'].associations_count).toBe(2);
  });

  it('administrators:preview construiește textul folosind datele firmei din Setări', async () => {
    seed();
    const result = await invoke<{ body: string }>(IPC.administrators.preview, { phone: '0722111222' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.body).toContain('Bloc A1');
    expect(result.data.body).toContain('Bloc B3');
    expect(result.data.body).toContain('0722000000');
    expect(result.data.body).toContain('Firma Test SRL');
  });

  it('administrators:preview eșuează clar dacă telefonul nu corespunde niciunui contact', async () => {
    const result = await invoke(IPC.administrators.preview, { phone: '0799999999' });
    expect(result.ok).toBe(false);
  });

  it('administrators:whatsapp:send deschide wa.me cu textul editat și salvează un log', async () => {
    const { a1, c1 } = seed();
    const mesajEditat = 'Mesaj editat manual de utilizator înainte de trimitere.';

    const result = await invoke<{ opened: boolean }>(IPC.administrators.whatsapp.send, {
      phone: '0722111222',
      message: mesajEditat,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.opened).toBe(true);

    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    const url = vi.mocked(shell.openExternal).mock.calls[0][0] as string;
    expect(url).toContain('https://wa.me/40722111222');
    expect(url).toContain(encodeURIComponent(mesajEditat));

    // Ancorare pe PRIMA asociație din grup (sortate alfabetic: „Bloc A1” înaintea „Bloc B3”),
    // cu contactul ei exact — alegere documentată în administrators.ipc.ts.
    const log = db.get<{ association_id: number; contact_id: number; message_preview: string; status: string }>(
      `SELECT association_id, contact_id, message_preview, status FROM message_logs ORDER BY id DESC LIMIT 1`,
    );
    expect(log).toBeDefined();
    expect(log!.association_id).toBe(a1);
    expect(log!.contact_id).toBe(c1);
    expect(log!.message_preview).toBe(mesajEditat);
    expect(log!.status).toBe('prepared');
  });

  it.each(['primul contact', 'altă asociație', 'duplicat mai vechi'] as const)('REGRESIE P2: „Nu contacta” pe %s blochează trimiterea agregată, inclusiv după previzualizare', async (caz) => {
    const { a1, c1, c2 } = seed();
    const preview = await invoke<{ body: string }>(IPC.administrators.preview, { phone: '0722111222' });
    expect(preview.ok).toBe(true);
    const blocat = caz === 'duplicat mai vechi' ? seedContact(db, a1, 'Contact vechi', '+40 722 111 222') : caz === 'altă asociație' ? c2 : c1;
    db.run("UPDATE contacts SET do_not_contact = 1, updated_at = '2020-01-01 00:00:00' WHERE id = ?", blocat);
    const grup = ctx.contacts.getAdministratorGroupByPhone('0040722111222', TODAY)!;
    expect(grup.do_not_contact).toBe(true);
    expect(grup.associations_count).toBe(2);
    if (caz === 'duplicat mai vechi') expect(grup.associations[0].contact_id).toBe(c1);
    const result = await invoke(IPC.administrators.whatsapp.send, { phone: '0040722111222', message: 'Situația completă' });
    expect(result).toEqual({ ok: false, error: 'Contactul este marcat „Nu contacta”.' });
    expect(shell.openExternal).not.toHaveBeenCalled();
    expect(db.get('SELECT COUNT(*) AS n FROM message_logs')).toEqual({ n: 0 });
  });

  it('un contact șters marcat „Nu contacta” nu blochează contactele active ale grupului', async () => {
    const { a1 } = seed();
    const vechi = seedContact(db, a1, 'Contact șters', '0722111222');
    db.run("UPDATE contacts SET do_not_contact = 1, deleted_at = '2026-01-01 00:00:00' WHERE id = ?", vechi);
    expect(ctx.contacts.getAdministratorGroupByPhone('0722111222', TODAY)?.do_not_contact).toBe(false);
    const result = await invoke(IPC.administrators.whatsapp.send, { phone: '0722111222', message: 'Situația completă' });
    expect(result).toEqual({ ok: true, data: { opened: true } });
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('administrators:whatsapp:send eșuează clar dacă telefonul nu corespunde niciunui contact', async () => {
    const result = await invoke(IPC.administrators.whatsapp.send, {
      phone: '0799999999',
      message: 'text',
    });
    expect(result.ok).toBe(false);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});
