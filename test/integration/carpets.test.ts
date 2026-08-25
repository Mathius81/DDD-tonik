import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../helpers/tmp-db';
import { extractPageSizeFromRenderer } from '../helpers/pagesize-contract';
import type { Db } from '../../src/main/db/database';
import { runMigrations, currentSchemaVersion } from '../../src/main/db/migrations';
import { CarpetClientRepository } from '../../src/main/db/repos/carpet-clients.repo';
import { CarpetOrderRepository } from '../../src/main/db/repos/carpet-orders.repo';
import { carpetClientListFilterSchema } from '../../src/shared/schemas/carpet';

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
      expect(currentSchemaVersion(t.db)).toBe(4);
      expect(runMigrations(t.db)).toEqual([]);

      const tables = t.db
        .all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'carpet_%' ORDER BY name`,
        )
        .map((r) => r.name);
      expect(tables).toEqual(['carpet_clients', 'carpet_order_items', 'carpet_orders']);
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
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    const gata = orders.create({
      client_id: clientId,
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
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'preluat',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
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
      pickup_date: '2026-08-25',
      due_date: null,
      status: 'in_lucru',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    orders.create({
      client_id: clientId,
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
      pickup_date: '2026-08-20',
      due_date: null,
      status: 'gata',
      price_per_sqm: null,
      notes: null,
      items: [{ type: 'covor', length_m: 1, width_m: 1 }],
    });
    const azi = orders.create({
      client_id: clientId,
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

  it('respinge o comandă pentru un client inexistent (foreign key)', () => {
    expect(() =>
      orders.create({
        client_id: 999999,
        pickup_date: '2026-08-20',
        due_date: null,
        status: 'preluat',
        price_per_sqm: null,
        notes: null,
        items: [{ type: 'covor', length_m: 1, width_m: 1 }],
      }),
    ).toThrow();
  });
});
