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
 * Spațiul de lucru Covoare (spălare covoare) — complet izolat de datele DDD
 * (associations/interventions/followups): tabele proprii, fără relații între ele.
 *
 * FĂRĂ facturare: `price_per_sqm` e opțional și strict informativ (afișat lângă
 * totalul de mp), aplicația nu emite niciun document fiscal, serie de factură
 * sau TVA. Dacă vreodată se adaugă facturare reală, va fi un modul separat.
 */
export const migration003: Migration = {
  version: 3,
  name: 'covoare',
  up(db) {
    db.exec(`
      CREATE TABLE carpet_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_carpet_clients_name ON carpet_clients(name);
      CREATE INDEX idx_carpet_clients_phone ON carpet_clients(phone);

      CREATE TABLE carpet_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES carpet_clients(id),
        pickup_date TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'preluat'
          CHECK (status IN ('preluat','in_lucru','gata','livrat')),
        -- Preț/mp opțional, STRICT informativ — nu generează factură sau alt document fiscal.
        price_per_sqm REAL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_carpet_orders_client ON carpet_orders(client_id);
      CREATE INDEX idx_carpet_orders_status ON carpet_orders(status);
      CREATE INDEX idx_carpet_orders_pickup_date ON carpet_orders(pickup_date);

      CREATE TABLE carpet_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES carpet_orders(id),
        type TEXT NOT NULL CHECK (type IN ('covor','mocheta','carpeta','traversa')),
        length_m REAL NOT NULL CHECK (length_m > 0),
        width_m REAL NOT NULL CHECK (width_m > 0),
        -- mp = lungime × lățime, calculat și rotunjit (2 zecimale) de aplicație la salvare.
        sqm REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_carpet_order_items_order ON carpet_order_items(order_id);
    `);
  },
};
