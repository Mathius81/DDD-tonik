/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { Migration } from './index';

/**
 * Spațiul de lucru Cauciucuri (vulcanizare + hotel de cauciucuri) — complet izolat de
 * datele DDD și de Covoare: tabele proprii, fără relații între spații.
 *
 * FĂRĂ facturare: nu există niciun preț, document fiscal sau TVA în acest modul.
 *
 * Poziția pe raft a unui set NU are câmpuri dedicate (rând/raft/poziție) — utilizatorul
 * o notează liber în `notes`, conform cerinței exprese.
 */
export const migration004: Migration = {
  version: 4,
  name: 'cauciucuri',
  up(db) {
    db.exec(`
      CREATE TABLE tyre_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_clients_name ON tyre_clients(name);
      CREATE INDEX idx_tyre_clients_phone ON tyre_clients(phone);

      CREATE TABLE tyre_vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES tyre_clients(id),
        -- Numărul de înmatriculare afișat exact cum a fost introdus (majuscule, spațiere lizibilă).
        plate_number TEXT NOT NULL,
        -- Normalizat pentru căutare rapidă: majuscule, fără spații/liniuțe (ex. 'B123ABC').
        plate_normalized TEXT NOT NULL,
        make TEXT,
        model TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_vehicles_client ON tyre_vehicles(client_id);
      CREATE INDEX idx_tyre_vehicles_plate ON tyre_vehicles(plate_normalized);

      CREATE TABLE tyre_storage_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES tyre_vehicles(id),
        -- Dimensiune anvelopă, ex. '205/55 R16'.
        size TEXT NOT NULL,
        brand TEXT,
        season TEXT NOT NULL CHECK (season IN ('vara','iarna')),
        quantity INTEGER NOT NULL DEFAULT 4 CHECK (quantity > 0),
        status TEXT NOT NULL DEFAULT 'in_depozit' CHECK (status IN ('in_depozit','ridicat')),
        date_in TEXT NOT NULL,
        date_out TEXT,
        -- Observații libere — AICI notează utilizatorul poziția pe raft (ex. „Raft 3, rând 2”).
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_storage_vehicle ON tyre_storage_sets(vehicle_id);
      CREATE INDEX idx_tyre_storage_status ON tyre_storage_sets(status);
      CREATE INDEX idx_tyre_storage_date_in ON tyre_storage_sets(date_in);
    `);
  },
};
