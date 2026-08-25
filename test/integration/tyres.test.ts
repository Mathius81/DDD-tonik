import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../helpers/tmp-db';
import { extractPageSizeFromRenderer } from '../helpers/pagesize-contract';
import type { Db } from '../../src/main/db/database';
import { runMigrations, currentSchemaVersion } from '../../src/main/db/migrations';
import { TyreClientRepository } from '../../src/main/db/repos/tyre-clients.repo';
import { TyreVehicleRepository } from '../../src/main/db/repos/tyre-vehicles.repo';
import { TyreStorageRepository } from '../../src/main/db/repos/tyre-storage.repo';
import { normalizePlate, tyreVehicleListFilterSchema, tyreClientListFilterSchema } from '../../src/shared/schemas/tyre';

describe('Contract: pageSize trimis de StorageFormModal (selectorul de mașini)', () => {
  it('valoarea REALĂ din sursa modalului trece validarea schemei zod folosite de handler-ul IPC', () => {
    // Citește direct din StorageFormModal.tsx — dacă cineva pune înapoi 500 (peste .max(200)
    // din tyreVehicleListFilterSchema), acest test trebuie să pice.
    const pageSize = extractPageSizeFromRenderer(
      'src/renderer/pages/cauciucuri/StorageFormModal.tsx',
      /ddd\.tyres\.vehicles\.list\(\{\s*page:\s*1,\s*pageSize:\s*(\d+)\s*\}\)/,
    );
    expect(() => tyreVehicleListFilterSchema.parse({ page: 1, pageSize })).not.toThrow();
  });
});

describe('Contract: pageSize trimis de VehicleFormModal (selectorul de clienți)', () => {
  it('valoarea REALĂ din sursa modalului trece validarea schemei zod folosite de handler-ul IPC', () => {
    // Citește direct din VehicleFormModal.tsx — dacă cineva pune înapoi 500 (peste .max(200)
    // din tyreClientListFilterSchema), acest test trebuie să pice.
    const pageSize = extractPageSizeFromRenderer(
      'src/renderer/pages/cauciucuri/VehicleFormModal.tsx',
      /ddd\.tyres\.clients\.list\(\{\s*page:\s*1,\s*pageSize:\s*(\d+)\s*\}\)/,
    );
    expect(() => tyreClientListFilterSchema.parse({ page: 1, pageSize })).not.toThrow();
  });
});

describe('Cauciucuri — migrația 004', () => {
  it('creează tabelele tyre_clients/tyre_vehicles/tyre_storage_sets și e idempotentă', () => {
    const t = createTestDb();
    try {
      expect(currentSchemaVersion(t.db)).toBe(4);
      expect(runMigrations(t.db)).toEqual([]);

      const tables = t.db
        .all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tyre_%' ORDER BY name`,
        )
        .map((r) => r.name);
      expect(tables).toEqual(['tyre_clients', 'tyre_storage_sets', 'tyre_vehicles']);
    } finally {
      t.cleanup();
    }
  });
});

describe('normalizePlate', () => {
  it('elimină spațiile/liniuțele și pune totul cu majuscule', () => {
    expect(normalizePlate('b 123 abc')).toBe('B123ABC');
    expect(normalizePlate('B-123-ABC')).toBe('B123ABC');
    expect(normalizePlate('B123ABC')).toBe('B123ABC');
  });
});

describe('TyreClientRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let repo: TyreClientRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    repo = new TyreClientRepository(db);
  });

  afterEach(() => cleanup());

  it('creează un client cu nume, telefon și observații și îl regăsește după id', () => {
    const created = repo.create({ name: 'Popescu Ion', phone: '0712345678', notes: 'Client vechi' });
    expect(created.id).toBeGreaterThan(0);

    const found = repo.getById(created.id);
    expect(found).toMatchObject({ name: 'Popescu Ion', phone: '0712345678', notes: 'Client vechi' });
  });

  it('normalizează câmpurile opționale goale la null', () => {
    const created = repo.create({ name: 'Georgescu Maria', phone: null, notes: null });
    expect(created.phone).toBeNull();
    expect(created.notes).toBeNull();
  });

  it('caută client după nume, fără diacritice', () => {
    repo.create({ name: 'Ionescu Ștefan', phone: '0722222222', notes: null });
    repo.create({ name: 'Vasilescu Andrei', phone: '0733333333', notes: null });

    const result = repo.list({ search: 'stefan', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe('Ionescu Ștefan');
  });

  it('caută client după telefon', () => {
    repo.create({ name: 'Popescu Ion', phone: '0712345678', notes: null });
    const result = repo.list({ search: '07123', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('actualizează un client existent', () => {
    const created = repo.create({ name: 'Popescu Ion', phone: null, notes: null });
    const updated = repo.update({ id: created.id, name: 'Popescu Ionuț', phone: '0700000000', notes: 'Actualizat' });
    expect(updated.name).toBe('Popescu Ionuț');
    expect(updated.phone).toBe('0700000000');
  });

  it('agregă corect numărul de mașini și seturile în depozit', () => {
    const client = repo.create({ name: 'Popescu Ion', phone: '0712345678', notes: null });
    const vehicles = new TyreVehicleRepository(db);
    const storage = new TyreStorageRepository(db);
    const vehicle = vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });
    storage.create({
      vehicle_id: vehicle.id,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-20',
      notes: null,
    });

    const result = repo.list({ page: 1, pageSize: 50 });
    expect(result.items[0].vehicles_count).toBe(1);
    expect(result.items[0].sets_in_storage).toBe(1);
  });
});

describe('TyreVehicleRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let clients: TyreClientRepository;
  let vehicles: TyreVehicleRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    clients = new TyreClientRepository(db);
    vehicles = new TyreVehicleRepository(db);
  });

  afterEach(() => cleanup());

  it('creează mașina și clientul într-un singur pas, fără client_id', () => {
    const vehicle = vehicles.create({
      client_id: null,
      client_name: 'Popescu Ion',
      client_phone: '0712345678',
      plate_number: 'B 123 ABC',
      make: 'Dacia',
      model: 'Duster',
      notes: null,
    });

    expect(vehicle.client_name).toBe('Popescu Ion');
    expect(vehicle.client_phone).toBe('0712345678');
    expect(vehicle.plate_number).toBe('B 123 ABC');
    expect(vehicle.plate_normalized).toBe('B123ABC');

    const allClients = clients.list({ page: 1, pageSize: 50 });
    expect(allClients.total).toBe(1);
  });

  it('creează o a doua mașină pentru un client existent, prin client_id', () => {
    const client = clients.create({ name: 'Popescu Ion', phone: '0712345678', notes: null });
    vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 111 AAA',
      make: null,
      model: null,
      notes: null,
    });
    vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 222 BBB',
      make: null,
      model: null,
      notes: null,
    });

    const allClients = clients.list({ page: 1, pageSize: 50 });
    expect(allClients.total).toBe(1);
    expect(allClients.items[0].vehicles_count).toBe(2);
  });

  it('editează mașina și actualizează, pe aceeași fișă, numele/telefonul clientului asociat', () => {
    const vehicle = vehicles.create({
      client_id: null,
      client_name: 'Popescu Ion',
      client_phone: '0712345678',
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });

    const updated = vehicles.update({
      id: vehicle.id,
      client_name: 'Popescu Ionuț',
      client_phone: '0700000000',
      plate_number: 'B 999 XYZ',
      make: 'Dacia',
      model: 'Logan',
      notes: 'Actualizat',
    });

    expect(updated.client_name).toBe('Popescu Ionuț');
    expect(updated.client_phone).toBe('0700000000');
    expect(updated.plate_number).toBe('B 999 XYZ');
    expect(updated.plate_normalized).toBe('B999XYZ');

    const client = clients.getById(vehicle.client_id);
    expect(client?.name).toBe('Popescu Ionuț');
    expect(client?.phone).toBe('0700000000');
  });

  it('caută mașina după numărul de înmatriculare, insensibil la spații', () => {
    vehicles.create({
      client_id: null,
      client_name: 'Popescu Ion',
      client_phone: null,
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });

    const result = vehicles.list({ search: 'B123ABC', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].plate_number).toBe('B 123 ABC');
  });

  it('caută mașina după numele clientului, fără diacritice', () => {
    vehicles.create({
      client_id: null,
      client_name: 'Ionescu Ștefan',
      client_phone: null,
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });

    const result = vehicles.list({ search: 'stefan', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('caută mașina după telefonul clientului', () => {
    vehicles.create({
      client_id: null,
      client_name: 'Popescu Ion',
      client_phone: '0712345678',
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });

    const result = vehicles.list({ search: '07123', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('filtrează mașinile după client_id', () => {
    const client = clients.create({ name: 'Popescu Ion', phone: null, notes: null });
    vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 111 AAA',
      make: null,
      model: null,
      notes: null,
    });
    vehicles.create({
      client_id: null,
      client_name: 'Alt Client',
      client_phone: null,
      plate_number: 'B 222 BBB',
      make: null,
      model: null,
      notes: null,
    });

    const result = vehicles.list({ client_id: client.id, page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].client_id).toBe(client.id);
  });

  it('respinge o mașină pentru un client inexistent (foreign key)', () => {
    expect(() =>
      vehicles.create({
        client_id: 999999,
        client_name: null,
        client_phone: null,
        plate_number: 'B 123 ABC',
        make: null,
        model: null,
        notes: null,
      }),
    ).toThrow();
  });
});

describe('TyreStorageRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let clients: TyreClientRepository;
  let vehicles: TyreVehicleRepository;
  let storage: TyreStorageRepository;
  let vehicleId: number;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    clients = new TyreClientRepository(db);
    vehicles = new TyreVehicleRepository(db);
    storage = new TyreStorageRepository(db);
    const client = clients.create({ name: 'Popescu Ion', phone: '0712345678', notes: null });
    vehicleId = vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    }).id;
  });

  afterEach(() => cleanup());

  it('creează un set nou, implicit „în depozit”', () => {
    const set = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: 'Michelin',
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-20',
      notes: 'Raft 3, poziția 2',
    });

    expect(set.status).toBe('in_depozit');
    expect(set.date_out).toBeNull();
    expect(set.plate_number).toBe('B 123 ABC');
    expect(set.client_name).toBe('Popescu Ion');
  });

  it('marchează un set ca ridicat (pickup) și îl poate readuce în depozit', () => {
    const set = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'vara',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });

    const pickedUp = storage.pickup(set.id, '2026-08-20');
    expect(pickedUp.status).toBe('ridicat');
    expect(pickedUp.date_out).toBe('2026-08-20');

    const back = storage.returnToStorage(set.id);
    expect(back.status).toBe('in_depozit');
    expect(back.date_out).toBeNull();
  });

  it('editează un set existent', () => {
    const set = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });

    const updated = storage.update({
      id: set.id,
      vehicle_id: vehicleId,
      size: '215/60 R16',
      brand: 'Continental',
      season: 'vara',
      quantity: 2,
      date_in: '2026-08-05',
      notes: 'Raft 1',
    });

    expect(updated.size).toBe('215/60 R16');
    expect(updated.brand).toBe('Continental');
    expect(updated.season).toBe('vara');
    expect(updated.quantity).toBe(2);
  });

  it('filtrează după status: implicit doar cele în depozit', () => {
    const inDepozit = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });
    const ridicat = storage.create({
      vehicle_id: vehicleId,
      size: '215/60 R16',
      brand: null,
      season: 'vara',
      quantity: 4,
      date_in: '2026-07-01',
      notes: null,
    });
    storage.pickup(ridicat.id, '2026-07-20');

    const current = storage.list({ status: 'in_depozit', page: 1, pageSize: 50 });
    expect(current.total).toBe(1);
    expect(current.items[0].id).toBe(inDepozit.id);

    const history = storage.list({ status: 'ridicat', page: 1, pageSize: 50 });
    expect(history.total).toBe(1);
    expect(history.items[0].id).toBe(ridicat.id);

    const all = storage.list({ status: 'all', page: 1, pageSize: 50 });
    expect(all.total).toBe(2);
  });

  it('filtrează după vehicle_id', () => {
    const otherVehicleId = vehicles.create({
      client_id: null,
      client_name: 'Alt Client',
      client_phone: null,
      plate_number: 'B 999 ZZZ',
      make: null,
      model: null,
      notes: null,
    }).id;
    storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });
    storage.create({
      vehicle_id: otherVehicleId,
      size: '215/60 R16',
      brand: null,
      season: 'vara',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });

    const result = storage.list({ status: 'all', vehicle_id: vehicleId, page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].vehicle_id).toBe(vehicleId);
  });

  it('caută în depozit după numărul mașinii, insensibil la spații', () => {
    storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });

    const result = storage.list({ status: 'all', search: 'B123ABC', page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
  });

  it('countInStorage și countIntakesSince numără corect', () => {
    storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-20',
      notes: null,
    });
    const old = storage.create({
      vehicle_id: vehicleId,
      size: '215/60 R16',
      brand: null,
      season: 'vara',
      quantity: 4,
      date_in: '2026-01-01',
      notes: null,
    });
    storage.pickup(old.id, '2026-01-10');

    expect(storage.countInStorage()).toBe(1);
    expect(storage.countIntakesSince('2026-08-01')).toBe(1);
    expect(storage.countIntakesSince('2026-01-01')).toBe(2);
  });

  it('listInStorage și listRecentIntakes întorc listele corecte, ordonate', () => {
    const first = storage.create({
      vehicle_id: vehicleId,
      size: 'A',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-08-01',
      notes: null,
    });
    const second = storage.create({
      vehicle_id: vehicleId,
      size: 'B',
      brand: null,
      season: 'vara',
      quantity: 4,
      date_in: '2026-08-10',
      notes: null,
    });

    // listInStorage: cele mai vechi primele (candidați pentru reminder).
    expect(storage.listInStorage(10).map((s) => s.id)).toEqual([first.id, second.id]);
    // listRecentIntakes: cele mai recente primele.
    expect(storage.listRecentIntakes(10).map((s) => s.id)).toEqual([second.id, first.id]);
  });

  it('respinge un set pentru o mașină inexistentă (foreign key)', () => {
    expect(() =>
      storage.create({
        vehicle_id: 999999,
        size: '205/55 R16',
        brand: null,
        season: 'iarna',
        quantity: 4,
        date_in: '2026-08-01',
        notes: null,
      }),
    ).toThrow();
  });

  it('respinge un anotimp invalid (CHECK)', () => {
    expect(() =>
      db.run(
        `INSERT INTO tyre_storage_sets (vehicle_id, size, season, date_in) VALUES (?, 'X', 'toamna', '2026-08-01')`,
        vehicleId,
      ),
    ).toThrow();
  });
});
