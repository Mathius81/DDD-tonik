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
 * Cauciucuri — programări, schimb de sezon și istoricul mesajelor pentru remindere.
 *
 * `tyre_appointments`: programare cu dată + oră fixă (fără posturi de lucru paralele —
 * un singur „rând” pe zi, exact cum a cerut proprietarul).
 *
 * `tyre_swaps`: o operație de schimb sezonier. Poate rezulta din finalizarea unei
 * programări (`appointment_id`) sau poate fi înregistrată direct. Cele două seturi
 * implicate (montat / demontat) sunt independente ca „proveniență”/„destinație”:
 *   - `mounted_source`: setul montat acum vine `adus_de_client` sau `din_depozit`
 *     (caz în care `mounted_storage_id` indică setul ridicat din hotel).
 *   - `removed_disposition`: setul demontat acum rămâne `acasa` la client sau intră
 *     `in_depozit` (caz în care `removed_storage_id` indică noul rând din hotel).
 * Repo-ul (`tyre-swaps.repo.ts`) face ambele mutări de stoc într-o SINGURĂ tranzacție.
 *
 * `tyre_message_log`: istoricul mesajelor WhatsApp trimise clienților Cauciucuri
 * (manual sau remindere automate de sezon). Servește și ca „gardă” anti-spam:
 * un client primește reminder-ul o singură dată per fereastră de sezon.
 */
export const migration006: Migration = {
  version: 6,
  name: 'cauciucuri_schimburi',
  up(db) {
    db.exec(`
      CREATE TABLE tyre_appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES tyre_vehicles(id),
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        -- Text liber (UI oferă sugestii: schimb sezon/montaj/echilibrare/vulcanizare/altele),
        -- fără CHECK — nu blocăm utilizatorul dacă apare un tip nou de lucrare.
        work_type TEXT NOT NULL,
        season TEXT CHECK (season IN ('vara','iarna')),
        status TEXT NOT NULL DEFAULT 'programat' CHECK (status IN ('programat','venit','finalizat','anulat')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_appointments_vehicle ON tyre_appointments(vehicle_id);
      CREATE INDEX idx_tyre_appointments_date ON tyre_appointments(appointment_date);
      CREATE INDEX idx_tyre_appointments_status ON tyre_appointments(status);

      CREATE TABLE tyre_swaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES tyre_vehicles(id),
        appointment_id INTEGER REFERENCES tyre_appointments(id),
        swap_date TEXT NOT NULL,
        -- Sezonul care se montează acum (opusul e cel demontat).
        to_season TEXT NOT NULL CHECK (to_season IN ('vara','iarna')),
        mounted_source TEXT NOT NULL CHECK (mounted_source IN ('adus_de_client','din_depozit')),
        mounted_storage_id INTEGER REFERENCES tyre_storage_sets(id),
        removed_disposition TEXT NOT NULL CHECK (removed_disposition IN ('acasa','depozit')),
        removed_storage_id INTEGER REFERENCES tyre_storage_sets(id),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_swaps_vehicle ON tyre_swaps(vehicle_id);
      CREATE INDEX idx_tyre_swaps_date ON tyre_swaps(swap_date);
      CREATE INDEX idx_tyre_swaps_appointment ON tyre_swaps(appointment_id);

      CREATE TABLE tyre_message_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES tyre_clients(id),
        channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','season_reminder')),
        season TEXT CHECK (season IN ('vara','iarna')),
        recipient TEXT,
        message_preview TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','sent','failed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_tyre_message_log_client ON tyre_message_log(client_id);
      -- Suportă direct interogarea de gardă anti-spam: „a mai primit clientul X
      -- reminder-ul de sezon Y de la începutul ferestrei curente?”
      CREATE INDEX idx_tyre_message_log_guard ON tyre_message_log(client_id, source, season, created_at);
    `);
  },
};
