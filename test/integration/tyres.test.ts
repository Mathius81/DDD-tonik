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

// Modulele din main importă 'electron'; îl înlocuim cu un mock minimal (același
// tipar ca în scheduler.test.ts/daily-digest.test.ts) — necesar pentru testele
// de mai jos care instanțiază TyreSeasonReminderService prin AppContext complet.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  Notification: class {
    static isSupported() {
      return false;
    }
    on() {}
    show() {}
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

import { createTestDb } from '../helpers/tmp-db';
import { extractPageSizeFromRenderer } from '../helpers/pagesize-contract';
import type { Db } from '../../src/main/db/database';
import { runMigrations, currentSchemaVersion } from '../../src/main/db/migrations';
import { TyreClientRepository } from '../../src/main/db/repos/tyre-clients.repo';
import { TyreVehicleRepository } from '../../src/main/db/repos/tyre-vehicles.repo';
import { TyreStorageRepository } from '../../src/main/db/repos/tyre-storage.repo';
import { TyreAppointmentRepository } from '../../src/main/db/repos/tyre-appointments.repo';
import { TyreSwapRepository, TyreSwapValidationError } from '../../src/main/db/repos/tyre-swaps.repo';
import { TyreMessageLogRepository } from '../../src/main/db/repos/tyre-message-log.repo';
import { AppContext } from '../../src/main/app-context';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { NotificationService } from '../../src/main/services/notification.service';
import { TyreSeasonReminderService, MAX_AUTO_SEND_ATTEMPTS } from '../../src/main/services/tyre-season-reminder.service';
import { WHATSAPP_REENGAGEMENT_ERROR_CODE, type WhatsappCloudProvider } from '../../src/main/services/messaging/whatsapp.provider';
import type { AppPaths } from '../../src/main/paths';
import { normalizePlate, tyreVehicleListFilterSchema, tyreClientListFilterSchema } from '../../src/shared/schemas/tyre';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as never;

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

describe('Cauciucuri — migrațiile 004, 006 și 007', () => {
  it('creează toate tabelele tyre_* și e idempotentă', () => {
    const t = createTestDb();
    try {
      expect(currentSchemaVersion(t.db)).toBe(7);
      expect(runMigrations(t.db)).toEqual([]);

      const tables = t.db
        .all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tyre_%' ORDER BY name`,
        )
        .map((r) => r.name);
      // migrația 004: clients/vehicles/storage_sets; migrația 006: appointments/swaps/message_log.
      // migrația 007 doar ALTER TABLE pe tyre_message_log — nu adaugă tabele noi.
      expect(tables).toEqual([
        'tyre_appointments',
        'tyre_clients',
        'tyre_message_log',
        'tyre_storage_sets',
        'tyre_swaps',
        'tyre_vehicles',
      ]);
    } finally {
      t.cleanup();
    }
  });

  it('migrația 007 adaugă season_key/error_message pe tyre_message_log și șablonul-ancoră pentru maparea Meta', () => {
    const t = createTestDb();
    try {
      const columns = t.db
        .all<{ name: string }>(`PRAGMA table_info(tyre_message_log)`)
        .map((c) => c.name);
      expect(columns).toEqual(expect.arrayContaining(['season_key', 'error_message']));

      const templateIdRaw = t.db.get<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'tyre_season_reminder_whatsapp_template_id'`,
      )?.value;
      expect(templateIdRaw).toBeTruthy();

      const template = t.db.get<{ active: number; channel: string }>(
        `SELECT active, channel FROM message_templates WHERE id = ?`,
        Number(templateIdRaw),
      );
      expect(template?.channel).toBe('whatsapp');
      // NU trebuie creat activ — ar dezactiva tăcut șablonul WhatsApp implicit al DDD-ului
      // (un singur șablon activ per canal, vezi MessageRepository.createTemplate).
      expect(template?.active).toBe(0);
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

describe('TyreAppointmentRepository', () => {
  let db: Db;
  let cleanup: () => void;
  let appointments: TyreAppointmentRepository;
  let vehicleId: number;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    appointments = new TyreAppointmentRepository(db);
    const clients = new TyreClientRepository(db);
    const vehicles = new TyreVehicleRepository(db);
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

  it('creează o programare cu dată și oră fixă și o regăsește', () => {
    const created = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '14:30',
      work_type: 'Schimb sezon',
      season: 'iarna',
      notes: null,
    });

    expect(created.appointment_time).toBe('14:30');
    expect(created.status).toBe('programat');
    expect(created.plate_number).toBe('B 123 ABC');
    expect(created.swap_id).toBeNull();

    const found = appointments.getById(created.id);
    expect(found?.appointment_date).toBe('2026-09-01');
    expect(found?.appointment_time).toBe('14:30');
  });

  it('actualizează data/ora/tipul lucrării unei programări existente', () => {
    const created = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '09:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });

    const updated = appointments.update({
      id: created.id,
      vehicle_id: vehicleId,
      appointment_date: '2026-09-02',
      appointment_time: '10:15',
      work_type: 'Echilibrare',
      season: 'vara',
      notes: 'Reprogramat la cererea clientului',
    });

    expect(updated.appointment_date).toBe('2026-09-02');
    expect(updated.appointment_time).toBe('10:15');
    expect(updated.work_type).toBe('Echilibrare');
    expect(updated.notes).toBe('Reprogramat la cererea clientului');
  });

  it('schimbă statusul unei programări (setStatus)', () => {
    const created = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '09:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });

    const finalized = appointments.setStatus({ id: created.id, status: 'finalizat' });
    expect(finalized.status).toBe('finalizat');
  });

  it('listează programările unei zile, ordonate după oră, indiferent de ordinea creării', () => {
    appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '16:00',
      work_type: 'Altele',
      season: null,
      notes: null,
    });
    appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '09:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });
    appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-02', // altă zi — nu trebuie să apară în lista zilei 09-01
      appointment_time: '08:00',
      work_type: 'Altele',
      season: null,
      notes: null,
    });

    const result = appointments.list({ date: '2026-09-01', status: 'all', page: 1, pageSize: 50 });
    expect(result.total).toBe(2);
    expect(result.items.map((a) => a.appointment_time)).toEqual(['09:00', '16:00']);
  });

  it('leagă schimbul înregistrat (swap_id) la programarea din care a pornit', () => {
    const appointment = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '09:00',
      work_type: 'Schimb sezon',
      season: 'iarna',
      notes: null,
    });
    appointments.setStatus({ id: appointment.id, status: 'finalizat' });

    const swaps = new TyreSwapRepository(db);
    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: appointment.id,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });

    const reloaded = appointments.getById(appointment.id);
    expect(reloaded?.swap_id).toBe(swap.id);
  });

  it('todosForToday: numără doar programările de azi, neprocesate (nu finalizat/anulat)', () => {
    appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '11:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });
    const toFinalize = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '08:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });
    appointments.setStatus({ id: toFinalize.id, status: 'finalizat' });
    const toCancel = appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-01',
      appointment_time: '09:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });
    appointments.setStatus({ id: toCancel.id, status: 'anulat' });
    appointments.create({
      vehicle_id: vehicleId,
      appointment_date: '2026-09-02', // altă zi — nu trebuie numărată
      appointment_time: '08:00',
      work_type: 'Montaj',
      season: null,
      notes: null,
    });

    const summary = appointments.todosForToday('2026-09-01');
    expect(summary.badge).toBe(1);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].plate_number).toBe('B 123 ABC');
    expect(summary.items[0].appointment_time).toBe('11:00');
  });
});

describe('TyreSwapRepository — schimb de sezon atomic', () => {
  let db: Db;
  let cleanup: () => void;
  let vehicles: TyreVehicleRepository;
  let storage: TyreStorageRepository;
  let swaps: TyreSwapRepository;
  let vehicleId: number;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    vehicles = new TyreVehicleRepository(db);
    storage = new TyreStorageRepository(db);
    swaps = new TyreSwapRepository(db);
    const clients = new TyreClientRepository(db);
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

  it('adus de client + rămâne acasă: nu atinge deloc depozitul', () => {
    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });

    expect(swap.mounted_storage_id).toBeNull();
    expect(swap.removed_storage_id).toBeNull();
    expect(storage.list({ status: 'all', vehicle_id: vehicleId, page: 1, pageSize: 50 }).total).toBe(0);
  });

  it('adus de client + intră în depozit: creează un rând nou, cu sezonul opus celui montat', () => {
    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'depozit',
      removed_size: '205/55 R16',
      removed_brand: 'Michelin',
      removed_quantity: 4,
      notes: null,
    });

    expect(swap.mounted_storage_id).toBeNull();
    expect(swap.removed_storage_id).not.toBeNull();

    const result = storage.list({ status: 'in_depozit', vehicle_id: vehicleId, page: 1, pageSize: 50 });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(swap.removed_storage_id);
    expect(result.items[0].season).toBe('vara'); // opus lui 'iarna' (to_season)
    expect(result.items[0].size).toBe('205/55 R16');
  });

  it('din depozit + rămâne acasă: setul montat iese din depozit (ridicat), fără niciun rând nou', () => {
    const existing = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-01-10',
      notes: null,
    });

    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'din_depozit',
      mounted_storage_id: existing.id,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });

    expect(swap.mounted_storage_id).toBe(existing.id);
    expect(swap.removed_storage_id).toBeNull();

    const all = storage.list({ status: 'all', vehicle_id: vehicleId, page: 1, pageSize: 50 });
    expect(all.total).toBe(1); // niciun rând nou creat
    expect(all.items[0].status).toBe('ridicat');
    expect(all.items[0].date_out).toBe('2026-09-01');
  });

  it('din depozit + intră în depozit: ambele mutări au loc, atomic, într-o singură tranzacție', () => {
    const existing = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-01-10',
      notes: null,
    });

    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'din_depozit',
      mounted_storage_id: existing.id,
      removed_disposition: 'depozit',
      removed_size: '215/60 R16',
      removed_brand: 'Continental',
      removed_quantity: 4,
      notes: null,
    });

    const all = storage.list({ status: 'all', vehicle_id: vehicleId, page: 1, pageSize: 50 });
    expect(all.total).toBe(2);

    const ridicat = all.items.find((s) => s.id === existing.id)!;
    expect(ridicat.status).toBe('ridicat');
    expect(ridicat.date_out).toBe('2026-09-01');

    const nou = all.items.find((s) => s.id === swap.removed_storage_id)!;
    expect(nou.status).toBe('in_depozit');
    expect(nou.season).toBe('vara'); // opus lui 'iarna' (to_season)
    expect(nou.size).toBe('215/60 R16');
  });

  it('respinge un set din depozit inexistent și NU creează schimbul (rollback)', () => {
    expect(() =>
      swaps.create({
        vehicle_id: vehicleId,
        appointment_id: null,
        swap_date: '2026-09-01',
        to_season: 'iarna',
        mounted_source: 'din_depozit',
        mounted_storage_id: 999999,
        removed_disposition: 'acasa',
        removed_size: null,
        removed_brand: null,
        removed_quantity: 4,
        notes: null,
      }),
    ).toThrow(TyreSwapValidationError);

    expect(swaps.list({ page: 1, pageSize: 50 }).total).toBe(0);
  });

  it('respinge un set din depozit care aparține altei mașini, fără nicio mutație parțială (rollback)', () => {
    const clients = new TyreClientRepository(db);
    const otherClient = clients.create({ name: 'Alt Client', phone: null, notes: null });
    const otherVehicleId = vehicles.create({
      client_id: otherClient.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 999 ZZZ',
      make: null,
      model: null,
      notes: null,
    }).id;
    const otherSet = storage.create({
      vehicle_id: otherVehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-01-10',
      notes: null,
    });

    expect(() =>
      swaps.create({
        vehicle_id: vehicleId, // altă mașină decât cea a setului
        appointment_id: null,
        swap_date: '2026-09-01',
        to_season: 'iarna',
        mounted_source: 'din_depozit',
        mounted_storage_id: otherSet.id,
        removed_disposition: 'acasa',
        removed_size: null,
        removed_brand: null,
        removed_quantity: 4,
        notes: null,
      }),
    ).toThrow(TyreSwapValidationError);

    expect(swaps.list({ page: 1, pageSize: 50 }).total).toBe(0);
    // Setul altui client rămâne complet neatins.
    const stillThere = storage.list({ status: 'in_depozit', vehicle_id: otherVehicleId, page: 1, pageSize: 50 });
    expect(stillThere.total).toBe(1);
    expect(stillThere.items[0].id).toBe(otherSet.id);
  });

  it('respinge un set deja ridicat, fără să-l mai atingă o dată (rollback)', () => {
    const set = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-01-10',
      notes: null,
    });
    storage.pickup(set.id, '2026-08-01');

    expect(() =>
      swaps.create({
        vehicle_id: vehicleId,
        appointment_id: null,
        swap_date: '2026-09-01',
        to_season: 'iarna',
        mounted_source: 'din_depozit',
        mounted_storage_id: set.id,
        removed_disposition: 'acasa',
        removed_size: null,
        removed_brand: null,
        removed_quantity: 4,
        notes: null,
      }),
    ).toThrow(TyreSwapValidationError);

    expect(swaps.list({ page: 1, pageSize: 50 }).total).toBe(0);
    // Data de ridicare originală nu a fost suprascrisă cu noua dată de schimb.
    const reloaded = storage.list({ status: 'ridicat', vehicle_id: vehicleId, page: 1, pageSize: 50 }).items[0];
    expect(reloaded.date_out).toBe('2026-08-01');
  });

  it('dacă inserarea setului demontat eșuează (constrângere DB), mutarea setului montat este anulată complet (rollback pe ambele direcții)', () => {
    // Setul care va fi „montat acum” — pornește în depozit.
    const existing = storage.create({
      vehicle_id: vehicleId,
      size: '205/55 R16',
      brand: null,
      season: 'iarna',
      quantity: 4,
      date_in: '2026-01-10',
      notes: null,
    });

    // Ocolim validarea zod (care ar cere removed_size obligatoriu) ca să testăm
    // direct atomicitatea tranzacției din repo: inserarea noului rând în
    // tyre_storage_sets eșuează la nivel de DB (size are NOT NULL), DUPĂ ce
    // setul montat a fost deja actualizat în cadrul aceleiași tranzacții.
    expect(() =>
      swaps.create({
        vehicle_id: vehicleId,
        appointment_id: null,
        swap_date: '2026-09-01',
        to_season: 'iarna',
        mounted_source: 'din_depozit',
        mounted_storage_id: existing.id,
        removed_disposition: 'depozit',
        removed_size: null, // forțează eșecul NOT NULL la insert (rar valid, dar tipul permite null)
        removed_brand: null,
        removed_quantity: 4,
        notes: null,
      }),
    ).toThrow();

    // Nimic nu a rămas pe jumătate făcut: setul original e tot 'in_depozit',
    // nu s-a creat niciun schimb și niciun rând nou de depozit.
    const reloaded = storage.list({ status: 'all', vehicle_id: vehicleId, page: 1, pageSize: 50 });
    expect(reloaded.total).toBe(1);
    expect(reloaded.items[0].id).toBe(existing.id);
    expect(reloaded.items[0].status).toBe('in_depozit');
    expect(reloaded.items[0].date_out).toBeNull();
    expect(swaps.list({ page: 1, pageSize: 50 }).total).toBe(0);
  });
});

describe('TyreSwapRepository — listare (istoric): paginare, căutare, filtru pe sezon', () => {
  let db: Db;
  let cleanup: () => void;
  let clients: TyreClientRepository;
  let vehicles: TyreVehicleRepository;
  let swaps: TyreSwapRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    clients = new TyreClientRepository(db);
    vehicles = new TyreVehicleRepository(db);
    swaps = new TyreSwapRepository(db);
  });

  afterEach(() => cleanup());

  function makeVehicle(name: string, phone: string, plate: string): number {
    const client = clients.create({ name, phone, notes: null });
    return vehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: plate,
      make: null,
      model: null,
      notes: null,
    }).id;
  }

  // Pagina Schimburi permite „Schimb nou” direct, fără nicio programare în prealabil
  // (exact fluxul real: clientul vine nepogramat la tejghea) — verificăm explicit că
  // appointment_id rămâne null și că mutarea seturilor funcționează la fel ca atunci
  // când schimbul pornește dintr-o programare.
  it('înregistrează un schimb FĂRĂ programare asociată (appointment_id null) și mută corect seturile', () => {
    const vehicleId = makeVehicle('Popescu Ion', '0712345678', 'B 123 ABC');
    const swap = swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'depozit',
      removed_size: '205/55 R16',
      removed_brand: 'Michelin',
      removed_quantity: 4,
      notes: null,
    });

    expect(swap.appointment_id).toBeNull();
    expect(swap.removed_storage_id).not.toBeNull();

    const found = swaps.getById(swap.id);
    expect(found?.appointment_id).toBeNull();
    expect(found?.plate_number).toBe('B 123 ABC');
    expect(found?.client_name).toBe('Popescu Ion');

    const listed = swaps.list({ page: 1, pageSize: 50 });
    expect(listed.total).toBe(1);
    expect(listed.items[0].appointment_id).toBeNull();
  });

  it('paginează istoricul, cel mai recent schimb primul', () => {
    const vehicleId = makeVehicle('Popescu Ion', '0712345678', 'B 123 ABC');
    ['2026-01-01', '2026-03-01', '2026-05-01'].forEach((swap_date) => {
      swaps.create({
        vehicle_id: vehicleId,
        appointment_id: null,
        swap_date,
        to_season: 'iarna',
        mounted_source: 'adus_de_client',
        mounted_storage_id: null,
        removed_disposition: 'acasa',
        removed_size: null,
        removed_brand: null,
        removed_quantity: 4,
        notes: null,
      });
    });

    const page1 = swaps.list({ page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((s) => s.swap_date)).toEqual(['2026-05-01', '2026-03-01']);

    const page2 = swaps.list({ page: 2, pageSize: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].swap_date).toBe('2026-01-01');
  });

  it('caută în istoric după numărul mașinii, numele clientului (fără diacritice) sau telefon', () => {
    const vehicleA = makeVehicle('Ionescu Ștefan', '0722222222', 'B 123 ABC');
    const vehicleB = makeVehicle('Vasilescu Andrei', '0733333333', 'CJ 99 XYZ');

    swaps.create({
      vehicle_id: vehicleA,
      appointment_id: null,
      swap_date: '2026-09-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });
    swaps.create({
      vehicle_id: vehicleB,
      appointment_id: null,
      swap_date: '2026-09-02',
      to_season: 'vara',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });

    expect(swaps.list({ search: 'stefan', page: 1, pageSize: 50 }).total).toBe(1);
    expect(swaps.list({ search: 'b123abc', page: 1, pageSize: 50 }).total).toBe(1);
    expect(swaps.list({ search: '07333', page: 1, pageSize: 50 }).total).toBe(1);
    expect(swaps.list({ search: 'nimeni', page: 1, pageSize: 50 }).total).toBe(0);
  });

  it('filtrează după sezonul spre care s-a făcut schimbul (to_season)', () => {
    const vehicleId = makeVehicle('Popescu Ion', '0712345678', 'B 123 ABC');
    swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-05-01',
      to_season: 'vara',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });
    swaps.create({
      vehicle_id: vehicleId,
      appointment_id: null,
      swap_date: '2026-10-01',
      to_season: 'iarna',
      mounted_source: 'adus_de_client',
      mounted_storage_id: null,
      removed_disposition: 'acasa',
      removed_size: null,
      removed_brand: null,
      removed_quantity: 4,
      notes: null,
    });

    const iarna = swaps.list({ to_season: 'iarna', page: 1, pageSize: 50 });
    expect(iarna.total).toBe(1);
    expect(iarna.items[0].swap_date).toBe('2026-10-01');

    const vara = swaps.list({ to_season: 'vara', page: 1, pageSize: 50 });
    expect(vara.total).toBe(1);
    expect(vara.items[0].swap_date).toBe('2026-05-01');
  });
});

describe('Remindere de sezon — gardă anti-spam (o singură dată per client, per season_key)', () => {
  let db: Db;
  let cleanup: () => void;
  let messageLog: TyreMessageLogRepository;
  let clientId: number;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    messageLog = new TyreMessageLogRepository(db);
    const clients = new TyreClientRepository(db);
    clientId = clients.create({ name: 'Popescu Ion', phone: '0712345678', notes: null }).id;
  });

  afterEach(() => cleanup());

  /**
   * DEFECT 3 (fix): de la migrația 007, garda nu se mai bazează pe un prag de dată
   * recalculat din ferestrele curente din Setări (care se pot schimba în mijlocul
   * sezonului), ci pe un `season_key` stabil (`iarna-2026`, `vara-2027`, ...) scris o
   * singură dată, la trimitere. `insert()` cere acum `created_at` explicit (DEFECT 1:
   * ora LOCALĂ, nu implicit UTC din SQLite) — nu mai există nicio scriere „implicită"
   * de suprascris ulterior, ca în varianta veche a acestui test.
   */
  function insertAt(
    createdAt: string,
    season: 'iarna' | 'vara' | null,
    seasonKey: string | null,
    source: 'manual' | 'season_reminder',
    status: 'sent' | 'prepared' | 'failed' = 'sent',
    errorMessage: string | null = null,
  ) {
    return messageLog.insert({
      client_id: clientId,
      source,
      season,
      season_key: seasonKey,
      recipient: '0712345678',
      message_preview: 'Mesaj de test',
      status,
      error_message: errorMessage,
      created_at: createdAt,
    });
  }

  it('hasBeenNotified: fals înainte de trimitere, adevărat după, pentru același season_key', () => {
    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2026')).toBe(false);

    insertAt('2026-10-15 09:00:00', 'iarna', 'iarna-2026', 'season_reminder');

    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2026')).toBe(true);
  });

  it('un mesaj trimis nu contează pentru un season_key diferit (sezonul din anul următor)', () => {
    insertAt('2026-10-15 09:00:00', 'iarna', 'iarna-2026', 'season_reminder');

    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2027')).toBe(false);
  });

  it('mesajele manuale sau de alt sezon nu declanșează garda', () => {
    insertAt('2026-10-15 09:00:00', null, null, 'manual');
    insertAt('2026-10-15 09:00:00', 'vara', 'vara-2026', 'season_reminder');

    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2026')).toBe(false);
  });

  it('DEFECT 2: o încercare automată eșuată (status=failed) NU contează ca „deja trimis" — clientul rămâne retrimisibil', () => {
    insertAt('2026-10-15 09:00:00', 'iarna', 'iarna-2026', 'season_reminder', 'failed', 'Eroare Meta 131047');

    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2026')).toBe(false);
    expect(messageLog.countFailedAttempts(clientId, 'iarna', 'iarna-2026')).toBe(1);
    expect(messageLog.lastFailureMessage(clientId, 'iarna', 'iarna-2026')).toBe('Eroare Meta 131047');
  });

  it('regresie: un mesaj asistat/manual (status=prepared) CONTEAZĂ ca „deja trimis" — modul asistat nu scrie niciodată status=sent', () => {
    // Modul asistat (buton „Trimite pe WhatsApp” din pagina Remindere) scrie mereu
    // status='prepared', niciodată 'sent' (nu există confirmare de livrare pentru trimiterile
    // manuale). Dacă garda ar filtra după `status = 'sent'` în loc de `status != 'failed'`,
    // acest test ar pica — clientul ar reapărea mereu ca „netrimis” în mod asistat.
    insertAt('2026-10-15 09:00:00', 'iarna', 'iarna-2026', 'season_reminder', 'prepared');

    expect(messageLog.hasBeenNotified(clientId, 'iarna', 'iarna-2026')).toBe(true);
  });

  it('countFailedAttempts numără eșecurile doar pentru season_key-ul cerut', () => {
    insertAt('2026-10-15 09:00:00', 'iarna', 'iarna-2026', 'season_reminder', 'failed');
    insertAt('2026-10-16 09:00:00', 'iarna', 'iarna-2026', 'season_reminder', 'failed');
    insertAt('2027-10-16 09:00:00', 'iarna', 'iarna-2027', 'season_reminder', 'failed');

    expect(messageLog.countFailedAttempts(clientId, 'iarna', 'iarna-2026')).toBe(2);
    expect(messageLog.countFailedAttempts(clientId, 'iarna', 'iarna-2027')).toBe(1);
  });
});

describe('TyreSeasonReminderService — trimitere automată (mod cloud_api), o singură dată per client per season_key', () => {
  let db: Db;
  let cleanup: () => void;

  const paths: AppPaths = { dataDir: '', backupsDir: '', logsDir: '', dbFile: '' };

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
  });

  afterEach(() => cleanup());

  /**
   * `setNow` permite avansarea ceasului fals ÎNTRE ticks (necesar pentru testul de la
   * Defectul 3, unde proprietarul schimbă ferestrele „la o dată ulterioară" primei trimiteri),
   * fără să reconstruim contextul (și, odată cu el, baza de date/repo-urile).
   */
  function makeService(nowIso: string) {
    let current = new Date(nowIso);
    const ctx = new AppContext(db, paths, silentLogger, () => null, () => current);
    const messaging = new MessagingService(ctx, new SecretsService(ctx));
    const notifications = new NotificationService(ctx);
    const service = new TyreSeasonReminderService(ctx);
    const setNow = (iso: string) => {
      current = new Date(iso);
    };
    return { ctx, messaging, notifications, service, setNow };
  }

  /** Un client eligibil (cauciucuri în depozit) minimal, reutilizat de mai multe teste. */
  function createEligibleClient(ctx: AppContext, season: 'iarna' | 'vara', dateIn: string) {
    const client = ctx.tyreClients.create({ name: 'Popescu Ion', phone: '0712345678', notes: null });
    const vehicle = ctx.tyreVehicles.create({
      client_id: client.id,
      client_name: null,
      client_phone: null,
      plate_number: 'B 123 ABC',
      make: null,
      model: null,
      notes: null,
    });
    ctx.tyreStorage.create({
      vehicle_id: vehicle.id,
      size: '205/55 R16',
      brand: null,
      season,
      quantity: 4,
      date_in: dateIn,
      notes: null,
    });
    return client;
  }

  it('DEFECT 1: sendCloudApiOne scrie created_at cu ora LOCALĂ (ctx.nowLocalIso), nu implicit UTC din SQLite', async () => {
    // Anul e ales departe în viitor (2032) doar ca să nu coincidă accidental cu data reală
    // la care rulează testele — fără legătură cu reparația în sine.
    const { ctx, messaging, notifications, service } = makeService('2032-01-01T00:10:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 1, day: 1 }, end: { month: 1, day: 31 } },
        vara: { start: { month: 6, day: 1 }, end: { month: 6, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });
    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    const client = createEligibleClient(ctx, 'iarna', '2032-01-01');

    vi.spyOn(messaging, 'sendWhatsappCloudApiAuto').mockResolvedValue({ ok: true, wamid: 'wamid-test' });

    await service.tick(messaging, notifications);

    const row = db.get<{ created_at: string }>(
      `SELECT created_at FROM tyre_message_log WHERE client_id = ? ORDER BY id DESC LIMIT 1`,
      client.id,
    );
    // Dacă scrierea ar fi rămas pe implicitul `datetime('now')` (UTC, ora REALĂ a mașinii),
    // acest test ar pica indiferent de fusul orar cu care rulează — comparăm exact cu
    // valoarea locală „falsă" din `ctx.now()`.
    expect(row?.created_at).toBe(ctx.nowLocalIso());
  });

  it('DEFECT 1: la 00:10 ora locală, în prima zi a ferestrei, al doilea tick NU retrimite (graniță UTC vs. locală)', async () => {
    // Ora e 00:10 LOCALĂ, în prima zi a ferestrei de iarnă (1 ianuarie). Pentru fusul
    // României (UTC+2/+3), ora locală 00:10 corespunde unei ore UTC din ZIUA ANTERIOARĂ —
    // exact granița pe care garda anti-spam trebuie să o gestioneze corect. Anul (2032) e
    // ales departe în viitor doar ca să nu coincidă accidental cu data reală de rulare.
    const { ctx, messaging, notifications, service } = makeService('2032-01-01T00:10:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 1, day: 1 }, end: { month: 1, day: 31 } },
        vara: { start: { month: 6, day: 1 }, end: { month: 6, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });

    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    createEligibleClient(ctx, 'iarna', '2032-01-01');

    const sendSpy = vi
      .spyOn(messaging, 'sendWhatsappCloudApiAuto')
      .mockResolvedValue({ ok: true, wamid: 'wamid-test' });

    await service.tick(messaging, notifications);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][1]).toBe('40712345678');

    const statusAfterFirst = service.status();
    expect(statusAfterFirst.eligible[0].already_sent).toBe(true);

    // Al doilea tick (ex.: următorul tick al scheduler-ului, la 10 minute) NU retrimite.
    await service.tick(messaging, notifications);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('remindere oprite din setări -> tick() nu face nimic', async () => {
    const { messaging, notifications, service } = makeService('2026-10-05T09:00:00');

    service.saveSettings({
      enabled: false,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}!',
    });

    const sendSpy = vi.spyOn(messaging, 'sendWhatsappCloudApiAuto');
    await service.tick(messaging, notifications);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('în afara ferestrei active -> nimeni nu e eligibil și nu se trimite nimic', () => {
    const { service } = makeService('2026-08-05T09:00:00'); // nici iarnă, nici vară, cu ferestrele implicite

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}!',
    });

    const status = service.status();
    expect(status.activeWindow).toBeNull();
    expect(status.eligible).toEqual([]);
  });

  it('DEFECT 2a: trimiterea automată transmite un templateUsedId real (nu null) către fallback-ul Meta', async () => {
    // Fără acest id, `sendWhatsappTemplateFallback` din messaging.service.ts (neatins) nu are
    // ce mapare să caute și eșuează mereu, permanent — remindere-le de sezon nu ar putea
    // funcționa niciodată automat, pentru că fereastra de 24h e aproape sigur închisă
    // (ultimul contact cu clienții de sezon e de obicei acum ~6 luni).
    const { ctx, messaging, notifications, service } = makeService('2026-10-05T09:00:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });
    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    createEligibleClient(ctx, 'iarna', '2026-10-01');

    const sendSpy = vi
      .spyOn(messaging, 'sendWhatsappCloudApiAuto')
      .mockResolvedValue({ ok: true, wamid: 'wamid-test' });

    await service.tick(messaging, notifications);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const templateUsedId = sendSpy.mock.calls[0][4];
    expect(templateUsedId).not.toBeNull();
    expect(typeof templateUsedId).toBe('number');

    const template = ctx.messages.getTemplate(templateUsedId as number);
    expect(template).toBeDefined();
    // Nu trebuie creat activ — un singur șablon poate fi activ per canal (whatsapp), iar
    // acesta nu trebuie să dezactiveze tăcut șablonul WhatsApp implicit al DDD-ului.
    expect(template?.active).toBe(false);
  });

  it('DEFECT 2a (integrare, fără mock pe fallback): fereastra de 24h închisă -> fallback-ul REAL de template reușește după ce maparea Meta e configurată', async () => {
    // Nu mock-uim `sendWhatsappCloudApiAuto` — verificăm end-to-end logica REALĂ, neatinsă,
    // din messaging.service.ts (`sendWhatsappTemplateFallback`), mock-uind doar la nivelul
    // furnizorului HTTP (`whatsappProvider()`), exact granița recomandată de politica de
    // fișiere „NU modifica" pentru acest fișier.
    const { ctx, messaging, notifications, service } = makeService('2026-10-05T09:00:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });
    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    createEligibleClient(ctx, 'iarna', '2026-10-01');

    // Pasul 1: fereastra de conversație e închisă (131047) și NU există încă nicio mapare
    // Meta configurată -> eșec VIZIBIL, cu mesaj explicativ (nu status „sent" ascuns).
    const providerNoMapping: Partial<WhatsappCloudProvider> = {
      isDryRun: () => false,
      sendText: vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'Fereastra de 24h s-a închis.', errorCode: WHATSAPP_REENGAGEMENT_ERROR_CODE }),
      sendTemplate: vi.fn(),
    };
    vi.spyOn(messaging, 'whatsappProvider').mockReturnValue(providerNoMapping as unknown as WhatsappCloudProvider);

    await service.tick(messaging, notifications);

    let status = service.status();
    expect(status.eligible[0].already_sent).toBe(false);
    expect(status.eligible[0].failed_attempts).toBe(1);
    expect(status.eligible[0].last_error).toMatch(/mapare|Meta|aprobat/i);
    expect(providerNoMapping.sendTemplate).not.toHaveBeenCalled();

    // Pasul 2: proprietarul configurează maparea Meta (Setări → WhatsApp → Mapare template-uri)
    // pentru șablonul-ancoră creat de migrația 007.
    const templateId = Number(ctx.settings.getRaw('tyre_season_reminder_whatsapp_template_id'));
    expect(templateId).toBeGreaterThan(0);
    ctx.messages.upsertWhatsappTemplateMap({
      message_template_id: templateId,
      meta_template_name: 'schimb_sezon_cauciucuri',
      language: 'ro',
      variables: [],
    });

    const providerWithMapping: Partial<WhatsappCloudProvider> = {
      isDryRun: () => false,
      sendText: vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'Fereastra de 24h s-a închis.', errorCode: WHATSAPP_REENGAGEMENT_ERROR_CODE }),
      sendTemplate: vi.fn().mockResolvedValue({ ok: true, wamid: 'wamid-template' }),
    };
    vi.spyOn(messaging, 'whatsappProvider').mockReturnValue(providerWithMapping as unknown as WhatsappCloudProvider);

    await service.tick(messaging, notifications);

    status = service.status();
    expect(status.eligible[0].already_sent).toBe(true);
    expect(providerWithMapping.sendTemplate).toHaveBeenCalledWith(
      '40712345678',
      'schimb_sezon_cauciucuri',
      'ro',
      [],
    );
  });

  it(`DEFECT 2b: după ${MAX_AUTO_SEND_ATTEMPTS} eșecuri automate, tick() nu mai reîncearcă — clientul rămâne disponibil pentru trimitere manuală`, async () => {
    // Fără plafon: `hasBeenNotified` nemaifiltrând eșecurile (fix Defectul 2b) ar însemna
    // reîncercare automată la FIECARE tick de scheduler (10 minute), la nesfârșit, pentru un
    // număr invalid permanent. Cu plafonul, după MAX_AUTO_SEND_ATTEMPTS eșecuri, trimiterea
    // automată se oprește, dar clientul rămâne vizibil (buton manual mereu disponibil).
    const { ctx, messaging, notifications, service } = makeService('2026-10-05T09:00:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 3, day: 15 }, end: { month: 4, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}!',
    });
    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    createEligibleClient(ctx, 'iarna', '2026-10-01');

    const sendSpy = vi
      .spyOn(messaging, 'sendWhatsappCloudApiAuto')
      .mockResolvedValue({ ok: false, error: 'Numărul de telefon nu e valid pe WhatsApp.' });

    for (let i = 0; i < MAX_AUTO_SEND_ATTEMPTS + 2; i++) {
      await service.tick(messaging, notifications);
    }

    expect(sendSpy).toHaveBeenCalledTimes(MAX_AUTO_SEND_ATTEMPTS);

    const status = service.status();
    expect(status.eligible[0].already_sent).toBe(false);
    expect(status.eligible[0].failed_attempts).toBe(MAX_AUTO_SEND_ATTEMPTS);
  });

  it('DEFECT 3: mutarea datei de start a ferestrei în mijlocul sezonului NU resetează garda (season_key stabil)', async () => {
    const { ctx, messaging, notifications, service, setNow } = makeService('2033-10-05T09:00:00');

    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 1 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 6, day: 1 }, end: { month: 6, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });
    const settings = ctx.settings.get();
    settings.whatsapp.mode = 'cloud_api';
    ctx.settings.save(settings);

    createEligibleClient(ctx, 'iarna', '2033-09-01');

    const sendSpy = vi
      .spyOn(messaging, 'sendWhatsappCloudApiAuto')
      .mockResolvedValue({ ok: true, wamid: 'wamid-test' });

    // 5 octombrie: fereastra veche (1 oct - 30 nov) e activă -> trimiterea reușește.
    await service.tick(messaging, notifications);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Proprietarul mută data de start a iernii din 1 în 20 octombrie — constatat pe 25
    // octombrie, deci fereastra tot activă (20 oct - 30 nov acoperă 25 oct).
    service.saveSettings({
      enabled: true,
      windows: {
        iarna: { start: { month: 10, day: 20 }, end: { month: 11, day: 30 } },
        vara: { start: { month: 6, day: 1 }, end: { month: 6, day: 30 } },
      },
      message_template: 'Bună ziua, {nume}! Este vremea schimbului de {sezon}.',
    });
    setNow('2033-10-25T09:00:00');

    // Fără fix, pragul s-ar recalcula din noua dată de start (20 oct), iar trimiterea din
    // 5 oct ar cădea sub prag -> retrimitere în masă la toți clienții. Cu fix (season_key
    // stabil = 'iarna-2033' indiferent de ajustările ulterioare), garda ține.
    await service.tick(messaging, notifications);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(service.status().eligible[0].already_sent).toBe(true);
  });
});
