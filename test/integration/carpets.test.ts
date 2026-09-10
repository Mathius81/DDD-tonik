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
import { extractPageSizeFromRenderer } from '../helpers/pagesize-contract';
import type { Db } from '../../src/main/db/database';
import { runMigrations, currentSchemaVersion } from '../../src/main/db/migrations';
import { CarpetClientRepository } from '../../src/main/db/repos/carpet-clients.repo';
import { CarpetOrderRepository } from '../../src/main/db/repos/carpet-orders.repo';
import { carpetClientListFilterSchema, type CarpetClientGroup } from '../../src/shared/schemas/carpet';
import { formatRo } from '../../src/shared/dates';

describe('Contract: pageSize trimis de OrderFormModal (selectorul de clienți)', () => {
  it('valoarea REALĂ din sursa modalului trece validarea schemei zod folosite de handler-ul IPC', () => {
    // Citește direct din OrderFormModal.tsx — dacă cineva pune înapoi 500 (peste .max(200)
    // din carpetClientListFilterSchema), acest test trebuie să pice, nu doar cel din renderer.
    const pageSize = extractPageSizeFromRenderer(
      'src/renderer/pages/covoare/OrderFormModal.tsx',
      /ddd\.carpets\.clients\.list\(\{\s*page:\s*1,\s*pageSize:\s*(\d+)\s*\}\)/,
    );
    expect(() => carpetClientListFilterSchema.parse({ page: 1, pageSize })).not.toThrow();
  });
});

describe('Covoare — migrația 003', () => {
  it('creează tabelele carpet_clients/carpet_orders/carpet_order_items și e idempotentă', () => {
    const t = createTestDb();
    try {
      // Versiunea globală crește cu fiecare migrație nouă din orice modul (ex.: migrația 007
      // — Cauciucuri/season_key — nu adaugă tabele carpet_*, dar tot incrementează versiunea).
      expect(currentSchemaVersion(t.db)).toBe(7);
      expect(runMigrations(t.db)).toEqual([]);

      const tables = t.db
        .all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'carpet_%' ORDER BY name`,
        )
        .map((r) => r.name);
      // migrația 005 (covoare_v2) adaugă carpet_settings + carpet_message_logs — tabele NOI,
      // izolate de restul aplicației (fără nicio coloană nouă pe tabele partajate).
      expect(tables).toEqual([
        'carpet_clients',
        'carpet_message_logs',
        'carpet_order_items',
        'carpet_orders',
        'carpet_settings',
      ]);
    } finally {
      t.cleanup();
    }
  });
});

describe('CarpetClientRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let repo: CarpetClientRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    repo = new CarpetClientRepository(db);
  });

  afterEach(() => cleanup());

  it('creează un client și îl regăsește după id', () => {
    const created = repo.create({
      name: 'Popescu Ion',
      phone: '0712345678',
      address: 'Str. Exemplu nr. 1',
      notes: 'Client fidel',
    });
    expect(created.id).toBeGreaterThan(0);

    const found = repo.getById(created.id);
    expect(found).toMatchObject({
      name: 'Popescu Ion',
      phone: '0712345678',
      address: 'Str. Exemplu nr. 1',
      notes: 'Client fidel',
    });
  });

  it('normalizează câmpurile opționale goale la null', () => {
    const created = repo.create({ name: 'Georgescu Maria', phone: null, address: null, notes: null });
    expect(created.phone).toBeNull();
    expect(created.address).toBeNull();
    expect(created.notes).toBeNull();
  });

  it('caută client după nume fără diacritice', () => {
    repo.create({ name: 'Ionescu Ștefan', phone: '0722222222', address: null, notes: null });
    repo.create({ name: 'Vasilescu Andrei', phone: '0733333333', address: null, notes: null });

    const result = repo.list({ search: 'stefan', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Ionescu Ștefan');
  });

  it('caută client după telefon', () => {
    repo.create({ name: 'Popescu Ion', phone: '0712345678', address: null, notes: null });
    const result = repo.list({ search: '07123', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('actualizează un client existent', () => {
    const created = repo.create({ name: 'Popescu Ion', phone: null, address: null, notes: null });
    const updated = repo.update({
      id: created.id,
      name: 'Popescu Ionuț',
      phone: '0700000000',
      address: 'Str. Nouă nr. 5',
      notes: 'Actualizat',
    });
    expect(updated.name).toBe('Popescu Ionuț');
    expect(updated.phone).toBe('0700000000');
  });
});

describe('CarpetOrderRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let clients: CarpetClientRepository;
  let orders: CarpetOrderRepository;
  let clientId: number;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    clients = new CarpetClientRepository(db);
    orders = new CarpetOrderRepository(db);
    clientId = clients.create({ name: 'Popescu Ion', phone: '0712345678', address: null, notes: null }).id;
  });

  afterEach(() => cleanup());

  it('creează o comandă cu covoare și calculează corect mp-ul total', () => {
    const order = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [
        { type: 'covor', length_m: 2, width_m: 3 },
        { type: 'traversa', length_m: 1.5, width_m: 0.8 },
      ],
    });

    expect(order.items).toHaveLength(2);
    expect(order.items[0].sqm).toBe(6);
    expect(order.items[1].sqm).toBe(1.2);
    expect(order.total_sqm).toBe(7.2);
    // Fără preț/mp completat, totalul informativ trebuie să rămână null (FĂRĂ facturare).
    expect(order.total_price).toBeNull();
  });

  it('calculează totalul informativ doar când price_per_sqm este completat', () => {
    const order = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: 15,
      notes: null,
      items: [{ type: 'mocheta', length_m: 4, width_m: 2 }],
    });

    expect(order.total_sqm).toBe(8);
    expect(order.total_price).toBe(120);
  });

  it('rotunjește corect suprafața pentru a evita artefactele de virgulă mobilă', () => {
    const order = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 0.1, width_m: 0.2 }],
    });
    // 0.1 * 0.2 = 0.020000000000000004 în virgulă mobilă brută
    expect(order.items[0].sqm).toBe(0.02);
  });

  it('respinge un covor cu dimensiuni invalide la nivel de bază de date (CHECK)', () => {
    expect(() =>
      db.run(
        `INSERT INTO carpet_order_items (order_id, type, length_m, width_m, sqm) VALUES (1, 'covor', -1, 2, -2)`,
      ),
    ).toThrow();
  });

  it('editează o comandă: înlocuiește lista de covoare', () => {
    const created = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 2, width_m: 2 }],
    });

    const updated = orders.update({
      id: created.id,
      client_id: clientId,
      pickup_date: '2026-08-21',
      due_date: '2026-08-25',
      status: 'in_lucru',
      price_per_sqm: 10,
      notes: 'Grăbit',
      items: [
        { type: 'covor', length_m: 2, width_m: 2 },
        { type: 'carpeta', length_m: 1, width_m: 1 },
      ],
    });

    expect(updated.status).toBe('in_lucru');
    expect(updated.pickup_date).toBe('2026-08-21');
    expect(updated.due_date).toBe('2026-08-25');
    expect(updated.items).toHaveLength(2);
    expect(updated.total_sqm).toBe(5);
    expect(updated.total_price).toBe(50);
  });

  it('setStatus schimbă doar statusul comenzii', () => {
    const created = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const updated = orders.setStatus(created.id, 'gata');
    expect(updated.status).toBe('gata');
    expect(updated.items).toHaveLength(1);
  });

  it('filtrează comenzile după status', () => {
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    const gata = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-21',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const result = orders.list({ status: 'gata', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(gata.id);
  });

  it('filtrează comenzile după client_id', () => {
    const otherClientId = clients.create({ name: 'Alt Client', phone: null, address: null, notes: null }).id;
    orders.create({
      client_id: otherClientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const result = orders.list({ client_id: clientId, status: 'all', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].client_id).toBe(clientId);
  });

  it('caută comenzile după numele sau telefonul clientului', () => {
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const result = orders.list({ status: 'all', search: 'popescu', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('countsForDashboard numără corect comenzile în lucru, gata și preluate azi', () => {
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-25',
      due_date: null,
      status: 'in_lucru',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-25',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const counts = orders.countsForDashboard('2026-08-25');
    expect(counts).toEqual({ in_lucru: 1, gata: 1, preluate_azi: 2 });
  });

  it('listByStatus și listPickedUpOn întorc listele corecte pentru dashboard', () => {
    const gata = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    const azi = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-25',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    expect(orders.listByStatus('gata').map((o) => o.id)).toEqual([gata.id]);
    expect(orders.listPickedUpOn('2026-08-25').map((o) => o.id)).toEqual([azi.id]);
  });

  it('todosForDashboard: numără comenzile gata de livrat și pe cele cu termen depășit, fără dubluri', () => {
    const gata = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    const overdue = orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-15',
      due_date: '2026-08-20', // termen deja depășit (azi = 2026-08-25) și încă nelivrată
      status: 'in_lucru',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    // Termen depășit, dar deja livrată — NU trebuie numărată.
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-15',
      due_date: '2026-08-20',
      status: 'livrat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    // Comandă normală, fără termen depășit și nu „gata" — NU trebuie numărată.
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-25',
      due_date: '2026-09-01',
      status: 'in_lucru',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const summary = orders.todosForDashboard('2026-08-25');
    expect(summary.badge).toBe(2);
    const byId = new Map(summary.items.map((i) => [i.order_id, i]));
    expect(byId.get(gata.id)?.reason).toBe('gata');
    expect(byId.get(overdue.id)?.reason).toBe('overdue');
    expect(summary.items).toHaveLength(2);
  });

  it('respinge o comandă pentru un client inexistent (foreign key)', () => {
    expect(() =>
      orders.create({
        client_id: 999999,
        client_name: null,
        client_phone: null,
        client_address: null,
        client_notes: null,
        pickup_date: '2026-08-20',
        due_date: null,
        status: 'preluat',
        price_per_sqm: null,
        notes: null,
        items: [{ type: 'covor', length_m: 1, width_m: 1 }],
      }),
    ).toThrow();
  });

  // ---------- getClientGroup — situația agregată „adunate per client” ----------
  //
  // Cerința clientului: aceeași persoană poate apărea pe mai multe rânduri în lista de
  // comenzi (una „în lucru”, alta „gata de livrat”) — aici trebuie să apară TOATE la un loc.

  function makeOrder(overrides: {
    pickup_date: string;
    due_date?: string | null;
    status: 'preluat' | 'in_lucru' | 'gata' | 'livrat';
    price_per_sqm?: number | null;
    length_m: number;
    width_m: number;
  }) {
    return orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: overrides.pickup_date,
      due_date: overrides.due_date ?? null,
      status: overrides.status,
      price_per_sqm: overrides.price_per_sqm ?? null,
      notes: null,
      items: [{ type: 'covor', length_m: overrides.length_m, width_m: overrides.width_m }],
    });
  }

  it('getClientGroup adună două comenzi ale aceluiași client într-un singur grup', () => {
    const o1 = makeOrder({ pickup_date: '2026-08-10', status: 'in_lucru', due_date: '2026-08-29', length_m: 4, width_m: 5 }); // 20 mp
    const o2 = makeOrder({ pickup_date: '2026-08-20', status: 'gata', length_m: 2, width_m: 3 }); // 6 mp

    const group = orders.getClientGroup(clientId)!;
    expect(group).toBeDefined();
    expect(group.client_ids).toEqual([clientId]);
    expect(group.open_orders).toHaveLength(2);
    const ids = group.open_orders.map((o) => o.order_id).sort();
    expect(ids).toEqual([o1.id, o2.id].sort());
    expect(group.delivered_orders).toHaveLength(0);
  });

  it('getClientGroup pentru un client cu o singură comandă întoarce un grup cu o singură comandă', () => {
    const o1 = makeOrder({ pickup_date: '2026-08-10', status: 'preluat', length_m: 1, width_m: 1 });

    const group = orders.getClientGroup(clientId)!;
    expect(group.open_orders).toHaveLength(1);
    expect(group.open_orders[0].order_id).toBe(o1.id);
    expect(group.delivered_orders).toHaveLength(0);
    expect(group.total_open_items).toBe(1);
    expect(group.total_open_sqm).toBe(1);
  });

  it('getClientGroup exclude comenzile livrate din open_orders, dar le păstrează în delivered_orders (istoric)', () => {
    const livrata = makeOrder({ pickup_date: '2026-08-01', status: 'livrat', length_m: 3, width_m: 3 }); // 9 mp
    const inLucru = makeOrder({ pickup_date: '2026-08-15', status: 'in_lucru', length_m: 2, width_m: 2 }); // 4 mp

    const group = orders.getClientGroup(clientId)!;
    expect(group.open_orders.map((o) => o.order_id)).toEqual([inLucru.id]);
    expect(group.delivered_orders.map((o) => o.order_id)).toEqual([livrata.id]);
    // Totalurile agregate numără DOAR comenzile deschise — livrata nu trebuie inclusă.
    expect(group.total_open_items).toBe(1);
    expect(group.total_open_sqm).toBe(4);
  });

  it('getClientGroup însumează corect numărul total de covoare și mp peste toate comenzile deschise', () => {
    makeOrder({ pickup_date: '2026-08-10', status: 'in_lucru', length_m: 4, width_m: 5 }); // 20 mp, 1 covor
    makeOrder({ pickup_date: '2026-08-20', status: 'gata', length_m: 2, width_m: 3 }); // 6 mp, 1 covor
    makeOrder({ pickup_date: '2026-08-01', status: 'livrat', length_m: 100, width_m: 100 }); // livrată — nu intră în total

    const group = orders.getClientGroup(clientId)!;
    expect(group.total_open_items).toBe(2);
    expect(group.total_open_sqm).toBe(26);
  });

  it('getClientGroup întoarce items cu dimensiuni și mp pentru fiecare comandă', () => {
    makeOrder({ pickup_date: '2026-08-10', status: 'in_lucru', length_m: 4, width_m: 5 });

    const group = orders.getClientGroup(clientId)!;
    expect(group.open_orders[0].items).toEqual([
      { type: 'covor', length_m: 4, width_m: 5, sqm: 20 },
    ]);
  });

  it('getClientGroup pentru un client inexistent întoarce undefined', () => {
    expect(orders.getClientGroup(999999)).toBeUndefined();
  });

  it('getClientGroup NU face interogări per comandă (batched, nu N+1)', () => {
    // 8 comenzi ale aceluiași client — numărul de interogări SQL trebuie să rămână FIX,
    // nu unul care crește proporțional cu numărul de comenzi/covoare.
    for (let i = 0; i < 8; i++) {
      makeOrder({ pickup_date: '2026-08-10', status: 'in_lucru', length_m: 1, width_m: 1 });
    }

    const spy = vi.spyOn(db, 'all');
    const group = orders.getClientGroup(clientId)!;
    expect(group.open_orders).toHaveLength(8);

    // Interogări așteptate, indiferent de N: client (db.get, nu db.all), frați după telefon,
    // comenzi (IN batched), covoare (IN batched) — cel mult 3 apeluri către db.all.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    spy.mockRestore();
  });

  it('getClientGroup unifică doi clienți duplicați cu ACELAȘI telefon (adunate per persoană, nu per rând de client)', () => {
    // Aceeași persoană introdusă din greșeală de două ori ca client separat — cerința
    // explicită a clientului: comenzile trebuie adunate per persoană, nu risipite.
    const duplicat = clients.create({
      name: 'Popescu Ion',
      phone: '0712345678', // exact același telefon ca `clientId` din beforeEach
      address: null,
      notes: null,
    });
    const o1 = makeOrder({ pickup_date: '2026-08-10', status: 'in_lucru', length_m: 2, width_m: 2 });
    const o2 = orders.create({
      client_id: duplicat.id,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const group = orders.getClientGroup(clientId)!;
    expect(group.client_ids.sort()).toEqual([clientId, duplicat.id].sort());
    expect(group.open_orders.map((o) => o.order_id).sort()).toEqual([o1.id, o2.id].sort());
  });

  it('getClientGroup NU unifică clienți fără telefon completat (ar risca uniri greșite pe nume)', () => {
    const faraTelefon1 = clients.create({ name: 'Omonim', phone: null, address: null, notes: null });
    const faraTelefon2 = clients.create({ name: 'Omonim', phone: null, address: null, notes: null });
    orders.create({
      client_id: faraTelefon1.id,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-10',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: faraTelefon2.id,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-11',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const group = orders.getClientGroup(faraTelefon1.id)!;
    expect(group.client_ids).toEqual([faraTelefon1.id]);
    expect(group.open_orders).toHaveLength(1);
  });
});

// ---------- buildCarpetClientSituationMessage — textul agregat ----------
//
// `carpets.ipc.ts` importă `shell` din `electron` (mod asistat: deschide wa.me) și `handle()`
// din `register.ts`, care înregistrează prin `ipcMain.handle`. Mock minimal, ca în
// `administrators.test.ts`.

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
import { registerCarpetHandlers, buildCarpetClientSituationMessage } from '../../src/main/ipc/carpets.ipc';
import { IPC } from '../../src/shared/ipc-contract';
import type { IpcResult } from '../../src/shared/ipc-contract';
import type { AppPaths } from '../../src/main/paths';

describe('buildCarpetClientSituationMessage — text agregat (o singură comandă WhatsApp per client)', () => {
  const group: CarpetClientGroup = {
    client_ids: [1],
    display_name: 'Marius Constantinescu',
    phone_display: '0739066031',
    open_orders: [
      {
        order_id: 10,
        status: 'in_lucru',
        pickup_date: '2026-08-10',
        due_date: '2026-08-29',
        items: [{ type: 'covor', length_m: 4, width_m: 5, sqm: 20 }],
        total_sqm: 20,
        total_price: 340,
      },
      {
        order_id: 11,
        status: 'gata',
        pickup_date: '2026-08-20',
        due_date: null,
        items: [{ type: 'covor', length_m: 2, width_m: 3, sqm: 6 }],
        total_sqm: 6,
        total_price: 102,
      },
    ],
    delivered_orders: [
      {
        order_id: 9,
        status: 'livrat',
        pickup_date: '2026-07-01',
        due_date: null,
        items: [{ type: 'covor', length_m: 1, width_m: 1, sqm: 1 }],
        total_sqm: 1,
        total_price: null,
      },
    ],
    total_open_items: 2,
    total_open_sqm: 26,
  };

  it('conține salutul, starea fiecărei comenzi deschise (cu termenul unde există) și totalul', () => {
    const text = buildCarpetClientSituationMessage(group, '0722000000');

    expect(text).toContain('Bună ziua, Marius Constantinescu.');
    expect(text).toContain(`1 covor (20 mp) — în lucru, termen ${formatRo('2026-08-29')}`);
    expect(text).toContain('1 covor (6 mp) — gata de livrat');
    expect(text).toContain('Total: 2 covoare, 26 mp.');
    expect(text).toContain('0722000000');
  });

  it('NU include comenzile deja livrate în text (rămân doar în istoric, în panoul de detaliu)', () => {
    const text = buildCarpetClientSituationMessage(group, '0722000000');
    // Doar cele 2 comenzi DESCHISE apar ca rânduri — comanda #9 (livrată) nu trebuie să
    // adauge un al treilea rând (nici să mărească totalul cu mp-ul/covorul ei).
    expect(text.match(/^• /gm)).toHaveLength(2);
    expect(text).toContain('Total: 2 covoare, 26 mp.');
  });

  it('omite rândul de contact dacă firma nu are telefon completat în Setări', () => {
    const text = buildCarpetClientSituationMessage(group, '');
    expect(text).not.toContain('Pentru ridicare');
  });
});

describe('carpets.ipc — handlere clientSituation', () => {
  let db: Db;
  let cleanup: () => void;
  let ctx: AppContext;
  let clients: CarpetClientRepository;
  let orders: CarpetOrderRepository;

  const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    clients = new CarpetClientRepository(db);
    orders = new CarpetOrderRepository(db);

    const paths: AppPaths = {
      dataDir: '/tmp/nu-se-foloseste',
      backupsDir: '/tmp/nu-se-foloseste/backups',
      logsDir: '/tmp/nu-se-foloseste/logs',
      dbFile: '/tmp/nu-se-foloseste/data/ddd-manager.sqlite',
    };
    ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date('2026-08-25T09:00:00'));
    ctx.settings.save({
      ...ctx.settings.get(),
      company: { ...ctx.settings.get().company, name: 'Firma Test SRL', phone: '0722000000' },
    });

    electronMock.handlers.clear();
    vi.mocked(shell.openExternal).mockClear();
    registerCarpetHandlers(ctx);
  });

  afterEach(() => cleanup());

  async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const fn = electronMock.handlers.get(channel);
    if (!fn) throw new Error(`Handler neînregistrat: ${channel}`);
    return (await fn({}, payload)) as IpcResult<T>;
  }

  it('carpets:clientSituation:get întoarce grupul agregat (deschise + istoric livrate)', async () => {
    const clientId = clients.create({ name: 'Marius Constantinescu', phone: '0739066031', address: null, notes: null }).id;
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-10',
      due_date: '2026-08-29',
      status: 'in_lucru',
      price_per_sqm: 17,
      notes: null,
      items: [{ type: 'covor', length_m: 4, width_m: 5 }],
    });
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-07-01',
      due_date: null,
      status: 'livrat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const result = await invoke<CarpetClientGroup>(IPC.carpets.clientSituation.get, { client_id: clientId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.open_orders).toHaveLength(1);
    expect(result.data.delivered_orders).toHaveLength(1);
  });

  it('carpets:clientSituation:preview construiește textul folosind telefonul firmei din Setări', async () => {
    const clientId = clients.create({ name: 'Marius Constantinescu', phone: '0739066031', address: null, notes: null }).id;
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-08-10',
      due_date: '2026-08-29',
      status: 'in_lucru',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 4, width_m: 5 }],
    });

    const result = await invoke<{ body: string }>(IPC.carpets.clientSituation.preview, { client_id: clientId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.body).toContain('Marius Constantinescu');
    expect(result.data.body).toContain('0722000000');
  });

  it('REGRESIE P3: situația WhatsApp afișează suma reală SQLite rotunjită la două zecimale', async () => {
    const clientId = clients.create({ name: 'Client Test', phone: '0712345678', address: null, notes: null }).id;
    orders.create({
      client_id: clientId, client_name: null, client_phone: null, client_address: null, client_notes: null,
      pickup_date: '2026-08-10', due_date: null, status: 'gata', price_per_sqm: null, notes: null,
      items: [{ type: 'covor', length_m: 6.99, width_m: 1 }, { type: 'covor', length_m: 4.39, width_m: 1 }],
    });
    expect(orders.getClientGroup(clientId)!.open_orders[0].total_sqm).toBe(11.379999999999999);
    const result = await invoke<{ body: string }>(IPC.carpets.clientSituation.preview, { client_id: clientId });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.body).toContain('2 covoare (11.38 mp)');
    expect(result.data.body).toContain('Total: 2 covoare, 11.38 mp.');
    expect(result.data.body).not.toContain('11.379999999999999');
  });

  it('carpets:clientSituation:preview eșuează clar dacă clientul nu are nicio comandă deschisă', async () => {
    const clientId = clients.create({ name: 'Client Fără Comenzi', phone: '0711111111', address: null, notes: null }).id;
    orders.create({
      client_id: clientId,
      client_name: null,
      client_phone: null,
      client_address: null,
      client_notes: null,
      pickup_date: '2026-07-01',
      due_date: null,
      status: 'livrat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });

    const result = await invoke(IPC.carpets.clientSituation.preview, { client_id: clientId });
    expect(result.ok).toBe(false);
  });

  it('carpets:whatsapp:send trimite mesajul agregat pentru client_id și salvează un log', async () => {
    const clientId = clients.create({ name: 'Marius Constantinescu', phone: '0739066031', address: null, notes: null }).id;
    const mesajEditat = 'Mesaj editat manual, agregat, înainte de trimitere.';

    const result = await invoke<{ opened: boolean }>(IPC.carpets.whatsapp.send, {
      client_id: clientId,
      message: mesajEditat,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.opened).toBe(true);
    expect(shell.openExternal).toHaveBeenCalledTimes(1);

    const log = db.get<{ client_id: number; message_preview: string }>(
      `SELECT client_id, message_preview FROM carpet_message_logs ORDER BY id DESC LIMIT 1`,
    );
    expect(log).toBeDefined();
    expect(log!.client_id).toBe(clientId);
    expect(log!.message_preview).toBe(mesajEditat);
  });
});
