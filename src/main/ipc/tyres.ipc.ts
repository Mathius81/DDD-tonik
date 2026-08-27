/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { z } from 'zod';
import { shell } from 'electron';
import { subDays } from 'date-fns';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  tyreClientCreateSchema,
  tyreClientUpdateSchema,
  tyreClientListFilterSchema,
  tyreVehicleCreateSchema,
  tyreVehicleUpdateSchema,
  tyreVehicleListFilterSchema,
  tyreStorageCreateSchema,
  tyreStorageUpdateSchema,
  tyreStorageListFilterSchema,
  tyreStoragePickupSchema,
  tyreStorageReturnSchema,
  tyreWhatsappSendSchema,
  tyreAppointmentCreateSchema,
  tyreAppointmentUpdateSchema,
  tyreAppointmentSetStatusSchema,
  tyreAppointmentListFilterSchema,
  tyreSwapCreateSchema,
  tyreSwapListFilterSchema,
  tyreMessageLogListFilterSchema,
  tyreSeasonReminderSettingsSchema,
} from '../../shared/schemas/tyre';
import { idSchema, toIsoDate } from '../../shared/schemas/common';
import { normalizePhoneE164 } from '../services/messaging/template-render';
import { TyreSwapValidationError } from '../db/repos/tyre-swaps.repo';
import { TyreSeasonReminderService } from '../services/tyre-season-reminder.service';
import type { AppContext } from '../app-context';

const RECENT_INTAKE_DAYS = 30;

/**
 * Handlere IPC pentru spațiul de lucru Cauciucuri — complet separate de DDD și de Covoare.
 *
 * Butonul de WhatsApp NU folosește MessagingService.send() (care cere un `contact_id` din
 * tabela `contacts` a DDD-ului): deschide direct wa.me, exact ca modul asistat descris în
 * `messaging.service.ts::sendWhatsappAssisted`. Trimiterea manuală se face DOAR la cererea
 * explicită a utilizatorului. Trimiterea AUTOMATĂ există doar pentru remindere-le de sezon
 * (vezi `tyre-season-reminder.service.ts`) — rulează din scheduler, respectă modul WhatsApp
 * (asistat/cloud_api) și trimite fiecărui client o singură dată per fereastră.
 */
export function registerTyreHandlers(ctx: AppContext): void {
  // Remindere automate de sezon — instanțiat devreme: handler-ul `whatsapp.send` de mai
  // jos are nevoie de `seasonKeyFor` pentru a eticheta corect trimiterile manuale de tip
  // „season_reminder" (aceeași cheie de fereastră ca reminder-ele automate).
  const seasonReminders = new TyreSeasonReminderService(ctx);

  // Clienți
  handle(IPC.tyres.clients.list, tyreClientListFilterSchema, (filter) => ctx.tyreClients.list(filter));

  handle(IPC.tyres.clients.get, z.object({ id: idSchema }), ({ id }) => {
    const client = ctx.tyreClients.getById(id);
    if (!client) throw new UserFacingError('Clientul nu a fost găsit.');
    return client;
  });

  handle(IPC.tyres.clients.create, tyreClientCreateSchema, (data) => {
    const client = ctx.tyreClients.create(data);
    ctx.logger.info(`Client cauciucuri creat: #${client.id} ${client.name}`);
    ctx.notifyDataChanged();
    return client;
  });

  handle(IPC.tyres.clients.update, tyreClientUpdateSchema, (data) => {
    const existing = ctx.tyreClients.getById(data.id);
    if (!existing) throw new UserFacingError('Clientul nu a fost găsit.');
    const client = ctx.tyreClients.update(data);
    ctx.notifyDataChanged();
    return client;
  });

  // Mașini
  handle(IPC.tyres.vehicles.list, tyreVehicleListFilterSchema, (filter) => ctx.tyreVehicles.list(filter));

  handle(IPC.tyres.vehicles.get, z.object({ id: idSchema }), ({ id }) => {
    const vehicle = ctx.tyreVehicles.getById(id);
    if (!vehicle) throw new UserFacingError('Mașina nu a fost găsită.');
    return vehicle;
  });

  handle(IPC.tyres.vehicles.create, tyreVehicleCreateSchema, (data) => {
    if (data.client_id) {
      const client = ctx.tyreClients.getById(data.client_id);
      if (!client) throw new UserFacingError('Clientul selectat nu există.');
    }
    const vehicle = ctx.tyreVehicles.create(data);
    ctx.logger.info(`Mașină cauciucuri adăugată: #${vehicle.id} ${vehicle.plate_number}`);
    ctx.notifyDataChanged();
    return vehicle;
  });

  handle(IPC.tyres.vehicles.update, tyreVehicleUpdateSchema, (data) => {
    const existing = ctx.tyreVehicles.getById(data.id);
    if (!existing) throw new UserFacingError('Mașina nu a fost găsită.');
    const vehicle = ctx.tyreVehicles.update(data);
    ctx.notifyDataChanged();
    return vehicle;
  });

  // Depozit (hotel de cauciucuri)
  handle(IPC.tyres.storage.list, tyreStorageListFilterSchema, (filter) => ctx.tyreStorage.list(filter));

  handle(IPC.tyres.storage.get, z.object({ id: idSchema }), ({ id }) => {
    const set = ctx.tyreStorage.getById(id);
    if (!set) throw new UserFacingError('Setul nu a fost găsit.');
    return set;
  });

  handle(IPC.tyres.storage.create, tyreStorageCreateSchema, (data) => {
    const vehicle = ctx.tyreVehicles.getById(data.vehicle_id);
    if (!vehicle) throw new UserFacingError('Mașina selectată nu există.');
    const set = ctx.tyreStorage.create(data);
    ctx.logger.info(`Set cauciucuri intrat în depozit: #${set.id} (mașina #${vehicle.id})`);
    ctx.notifyDataChanged();
    return set;
  });

  handle(IPC.tyres.storage.update, tyreStorageUpdateSchema, (data) => {
    const existing = ctx.tyreStorage.getById(data.id);
    if (!existing) throw new UserFacingError('Setul nu a fost găsit.');
    const vehicle = ctx.tyreVehicles.getById(data.vehicle_id);
    if (!vehicle) throw new UserFacingError('Mașina selectată nu există.');
    const set = ctx.tyreStorage.update(data);
    ctx.notifyDataChanged();
    return set;
  });

  handle(IPC.tyres.storage.pickup, tyreStoragePickupSchema, ({ id, date_out }) => {
    const existing = ctx.tyreStorage.getById(id);
    if (!existing) throw new UserFacingError('Setul nu a fost găsit.');
    if (existing.status === 'ridicat') throw new UserFacingError('Setul a fost deja ridicat.');
    const set = ctx.tyreStorage.pickup(id, date_out);
    ctx.notifyDataChanged();
    return set;
  });

  handle(IPC.tyres.storage.returnToStorage, tyreStorageReturnSchema, ({ id }) => {
    const existing = ctx.tyreStorage.getById(id);
    if (!existing) throw new UserFacingError('Setul nu a fost găsit.');
    if (existing.status === 'in_depozit') throw new UserFacingError('Setul este deja în depozit.');
    const set = ctx.tyreStorage.returnToStorage(id);
    ctx.notifyDataChanged();
    return set;
  });

  // Dashboard
  handle(IPC.tyres.dashboard.get, null, () => {
    const since = toIsoDate(subDays(ctx.now(), RECENT_INTAKE_DAYS));
    return {
      counts: {
        sets_in_storage: ctx.tyreStorage.countInStorage(),
        vehicles_total: ctx.tyreVehicles.count(),
        intakes_last_30_days: ctx.tyreStorage.countIntakesSince(since),
      },
      inStorage: ctx.tyreStorage.listInStorage(20),
      recentIntakes: ctx.tyreStorage.listRecentIntakes(20),
    };
  });

  handle(IPC.tyres.dashboard.todos, null, () => ctx.tyreAppointments.todosForToday(ctx.todayIso()));

  // WhatsApp — mod asistat: deschide wa.me cu mesajul pregătit; trimiterea rămâne manuală.
  // Folosit atât din fișa clientului (mesaj liber), cât și din pagina Remindere (mesaj de
  // sezon pregătit) — `source`/`season` doar etichetează rândul din istoric, nu schimbă
  // comportamentul de trimitere.
  handle(IPC.tyres.whatsapp.send, tyreWhatsappSendSchema, async ({ client_id, message, source, season }) => {
    const client = ctx.tyreClients.getById(client_id);
    if (!client) throw new UserFacingError('Clientul nu a fost găsit.');
    if (!client.phone) throw new UserFacingError('Clientul nu are număr de telefon.');
    const phone = normalizePhoneE164(client.phone);
    if (!phone) {
      throw new UserFacingError(
        `Numărul de telefon „${client.phone}” nu pare valid. Corectează-l în fișa clientului.`,
      );
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    await shell.openExternal(url);

    ctx.tyreMessageLog.insert({
      client_id: client.id,
      source,
      season,
      // Aceeași cheie de fereastră ca reminder-ele automate (vezi `seasonKeyFor`) — o
      // trimitere manuală „season_reminder" trebuie să satisfacă garda anti-spam la fel
      // ca una automată, altfel clientul ar primi și mesajul automat ulterior.
      season_key: source === 'season_reminder' && season ? seasonReminders.seasonKeyFor(season) : null,
      recipient: client.phone,
      message_preview: message.slice(0, 500),
      status: 'prepared',
      created_at: ctx.nowLocalIso(),
    });
    ctx.logger.info(`WhatsApp asistat deschis pentru client cauciucuri #${client.id}`);
    return { opened: true };
  });

  // Programări (dată + oră fixă)
  handle(IPC.tyres.appointments.list, tyreAppointmentListFilterSchema, (filter) =>
    ctx.tyreAppointments.list(filter),
  );

  handle(IPC.tyres.appointments.get, z.object({ id: idSchema }), ({ id }) => {
    const appointment = ctx.tyreAppointments.getById(id);
    if (!appointment) throw new UserFacingError('Programarea nu a fost găsită.');
    return appointment;
  });

  handle(IPC.tyres.appointments.create, tyreAppointmentCreateSchema, (data) => {
    const vehicle = ctx.tyreVehicles.getById(data.vehicle_id);
    if (!vehicle) throw new UserFacingError('Mașina selectată nu există.');
    const appointment = ctx.tyreAppointments.create(data);
    ctx.logger.info(`Programare cauciucuri creată: #${appointment.id} (mașina #${vehicle.id})`);
    ctx.notifyDataChanged();
    return appointment;
  });

  handle(IPC.tyres.appointments.update, tyreAppointmentUpdateSchema, (data) => {
    const existing = ctx.tyreAppointments.getById(data.id);
    if (!existing) throw new UserFacingError('Programarea nu a fost găsită.');
    const vehicle = ctx.tyreVehicles.getById(data.vehicle_id);
    if (!vehicle) throw new UserFacingError('Mașina selectată nu există.');
    const appointment = ctx.tyreAppointments.update(data);
    ctx.notifyDataChanged();
    return appointment;
  });

  handle(IPC.tyres.appointments.setStatus, tyreAppointmentSetStatusSchema, (data) => {
    const existing = ctx.tyreAppointments.getById(data.id);
    if (!existing) throw new UserFacingError('Programarea nu a fost găsită.');
    const appointment = ctx.tyreAppointments.setStatus(data);
    ctx.notifyDataChanged();
    return appointment;
  });

  // Schimb de sezon — mută atomic setul montat/demontat din/în depozit.
  handle(IPC.tyres.swaps.list, tyreSwapListFilterSchema, (filter) => ctx.tyreSwaps.list(filter));

  handle(IPC.tyres.swaps.get, z.object({ id: idSchema }), ({ id }) => {
    const swap = ctx.tyreSwaps.getById(id);
    if (!swap) throw new UserFacingError('Schimbul nu a fost găsit.');
    return swap;
  });

  handle(IPC.tyres.swaps.create, tyreSwapCreateSchema, (data) => {
    const vehicle = ctx.tyreVehicles.getById(data.vehicle_id);
    if (!vehicle) throw new UserFacingError('Mașina selectată nu există.');
    if (data.appointment_id) {
      const appointment = ctx.tyreAppointments.getById(data.appointment_id);
      if (!appointment) throw new UserFacingError('Programarea selectată nu există.');
      if (appointment.vehicle_id !== data.vehicle_id) {
        throw new UserFacingError('Programarea selectată este pentru altă mașină.');
      }
    }
    if (data.mounted_source === 'din_depozit' && data.mounted_storage_id) {
      const set = ctx.tyreStorage.getById(data.mounted_storage_id);
      if (!set) throw new UserFacingError('Setul ales din depozit nu a fost găsit.');
      if (set.vehicle_id !== data.vehicle_id) {
        throw new UserFacingError('Setul ales din depozit aparține altei mașini.');
      }
      if (set.status !== 'in_depozit') {
        throw new UserFacingError('Setul ales din depozit a fost deja ridicat.');
      }
    }
    try {
      const swap = ctx.tyreSwaps.create(data);
      ctx.logger.info(`Schimb de sezon înregistrat: #${swap.id} (mașina #${vehicle.id})`);
      ctx.notifyDataChanged();
      return swap;
    } catch (err) {
      if (err instanceof TyreSwapValidationError) throw new UserFacingError(err.message);
      throw err;
    }
  });

  // Istoricul mesajelor Cauciucuri (manual + remindere de sezon)
  handle(IPC.tyres.messages.list, tyreMessageLogListFilterSchema, (filter) => ctx.tyreMessageLog.list(filter));

  // Remindere automate de sezon (serviciul e instanțiat mai sus, în capul funcției)
  handle(IPC.tyres.seasonReminders.getSettings, null, () => seasonReminders.getSettings());

  handle(IPC.tyres.seasonReminders.saveSettings, tyreSeasonReminderSettingsSchema, (data) => {
    const settings = seasonReminders.saveSettings(data);
    ctx.logger.info('Setările reminder-elor de sezon (Cauciucuri) au fost actualizate');
    return settings;
  });

  handle(IPC.tyres.seasonReminders.status, null, () => seasonReminders.status());
}
