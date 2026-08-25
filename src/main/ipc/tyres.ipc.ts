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
} from '../../shared/schemas/tyre';
import { idSchema, toIsoDate } from '../../shared/schemas/common';
import { normalizePhoneE164 } from '../services/messaging/template-render';
import type { AppContext } from '../app-context';

const RECENT_INTAKE_DAYS = 30;

/**
 * Handlere IPC pentru spațiul de lucru Cauciucuri — complet separate de DDD și de Covoare.
 *
 * Butonul de WhatsApp NU folosește MessagingService.send() (care cere un `contact_id` din
 * tabela `contacts` a DDD-ului): deschide direct wa.me, exact ca modul asistat descris în
 * `messaging.service.ts::sendWhatsappAssisted`. Trimiterea se face DOAR la cererea explicită
 * a utilizatorului (niciodată automat) — nu există scheduler/remindere pentru acest spațiu.
 */
export function registerTyreHandlers(ctx: AppContext): void {
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

  // WhatsApp — mod asistat: deschide wa.me cu mesajul pregătit; trimiterea rămâne manuală.
  handle(IPC.tyres.whatsapp.send, tyreWhatsappSendSchema, async ({ client_id, message }) => {
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

    // contact_id/association_id sunt nullable în message_logs (schema DDD) — logăm fără
    // să încălcăm nicio constrângere de FK, doar cu recipient/canal/preview proprii.
    ctx.messages.insertLog({
      association_id: null,
      contact_id: null,
      followup_id: null,
      reminder_id: null,
      channel: 'whatsapp',
      recipient: client.phone,
      template_id: null,
      message_preview: message.slice(0, 500),
      status: 'prepared',
    });
    ctx.logger.info(`WhatsApp asistat deschis pentru client cauciucuri #${client.id}`);
    return { opened: true };
  });
}
