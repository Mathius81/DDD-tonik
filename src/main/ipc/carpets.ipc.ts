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
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  carpetClientCreateSchema,
  carpetClientUpdateSchema,
  carpetClientListFilterSchema,
  carpetClientIdSchema,
  carpetOrderCreateSchema,
  carpetOrderUpdateSchema,
  carpetOrderListFilterSchema,
  carpetOrderSetStatusSchema,
  carpetCalendarMonthFilterSchema,
  carpetSettingsUpdateSchema,
  carpetMessageListFilterSchema,
  carpetWhatsappSendSchema,
  carpetOrderStatusLabels,
  type CarpetClientGroup,
} from '../../shared/schemas/carpet';
import { idSchema } from '../../shared/schemas/common';
import { addMonthsClamped, formatRo } from '../../shared/dates';
import { pluralRo } from '../../shared/text';
import { normalizePhoneE164 } from '../services/messaging/template-render';
import type { AppContext } from '../app-context';

/**
 * Textul agregat cu situația comenzilor DESCHISE ale unui client (preluat/în lucru/gata) —
 * cerința clientului: „să fie adunate covoarele per client” într-un singur mesaj, nu unul
 * separat per comandă. Comenzile deja livrate NU intră aici (rămân doar în istoricul din
 * panoul de detaliu). Funcție pură (fără acces la bază), testabilă direct — la fel ca
 * `buildAdministratorSituationMessage` din DDD.
 */
export function buildCarpetClientSituationMessage(group: CarpetClientGroup, companyPhone: string): string {
  const lines: string[] = [
    `Bună ziua, ${group.display_name}.`,
    '',
    'Situația comenzilor dumneavoastră:',
  ];
  for (const o of group.open_orders) {
    const itemsPart = `${pluralRo(o.items.length, 'covor', 'covoare')} (${Math.round(o.total_sqm * 100) / 100} mp)`;
    const statusLabel = carpetOrderStatusLabels[o.status].toLowerCase();
    const duePart = o.due_date ? `, termen ${formatRo(o.due_date)}` : '';
    lines.push(`• ${itemsPart} — ${statusLabel}${duePart}`);
  }
  lines.push('', `Total: ${pluralRo(group.total_open_items, 'covor', 'covoare')}, ${Math.round(group.total_open_sqm * 100) / 100} mp.`);
  if (companyPhone) lines.push('', `Pentru ridicare ne puteți contacta la ${companyPhone}.`);
  return lines.join('\n');
}

/** Handlere IPC pentru spațiul de lucru Covoare — complet separate de DDD. */
export function registerCarpetHandlers(ctx: AppContext): void {
  // Clienți
  handle(IPC.carpets.clients.list, carpetClientListFilterSchema, (filter) =>
    ctx.carpetClients.list(filter),
  );

  handle(IPC.carpets.clients.get, z.object({ id: idSchema }), ({ id }) => {
    const client = ctx.carpetClients.getById(id);
    if (!client) throw new UserFacingError('Clientul nu a fost găsit.');
    return client;
  });

  handle(IPC.carpets.clients.create, carpetClientCreateSchema, (data) => {
    const client = ctx.carpetClients.create(data);
    ctx.logger.info(`Client covoare creat: #${client.id} ${client.name}`);
    ctx.notifyDataChanged();
    return client;
  });

  handle(IPC.carpets.clients.update, carpetClientUpdateSchema, (data) => {
    const client = ctx.carpetClients.update(data);
    ctx.notifyDataChanged();
    return client;
  });

  // Comenzi
  handle(IPC.carpets.orders.list, carpetOrderListFilterSchema, (filter) =>
    ctx.carpetOrders.list(filter),
  );

  handle(IPC.carpets.orders.get, z.object({ id: idSchema }), ({ id }) => {
    const order = ctx.carpetOrders.getById(id);
    if (!order) throw new UserFacingError('Comanda nu a fost găsită.');
    return order;
  });

  handle(IPC.carpets.orders.create, carpetOrderCreateSchema, (data) => {
    // Clientul poate fi ales din listă (client_id) SAU creat pe loc (client_name + ...) —
    // vezi carpetOrderCreateSchema.refine(). Validăm existența doar în primul caz.
    if (data.client_id) {
      const client = ctx.carpetClients.getById(data.client_id);
      if (!client) throw new UserFacingError('Clientul selectat nu există.');
    }
    const order = ctx.carpetOrders.create(data);
    ctx.logger.info(`Comandă covoare creată: #${order.id} pentru ${order.client_name}`);
    ctx.notifyDataChanged();
    return order;
  });

  handle(IPC.carpets.orders.update, carpetOrderUpdateSchema, (data) => {
    const client = ctx.carpetClients.getById(data.client_id);
    if (!client) throw new UserFacingError('Clientul selectat nu există.');
    const order = ctx.carpetOrders.update(data);
    ctx.notifyDataChanged();
    return order;
  });

  handle(IPC.carpets.orders.setStatus, carpetOrderSetStatusSchema, ({ id, status }) => {
    const existing = ctx.carpetOrders.getById(id);
    if (!existing) throw new UserFacingError('Comanda nu a fost găsită.');
    const order = ctx.carpetOrders.setStatus(id, status);
    ctx.notifyDataChanged();
    return order;
  });

  // Dashboard
  handle(IPC.carpets.dashboard.get, null, () => {
    const today = ctx.todayIso();
    return {
      counts: ctx.carpetOrders.countsForDashboard(today),
      readyToDeliver: ctx.carpetOrders.listByStatus('gata', 20),
      todayPickups: ctx.carpetOrders.listPickedUpOn(today, 20),
    };
  });

  handle(IPC.carpets.dashboard.todos, null, () => ctx.carpetOrders.todosForDashboard(ctx.todayIso()));

  // Calendar
  handle(IPC.carpets.calendar.month, carpetCalendarMonthFilterSchema, ({ month }) =>
    ctx.carpetOrders.calendarMonth(month),
  );

  // Setări
  handle(IPC.carpets.settings.get, null, () => ctx.carpetSettings.get());

  handle(IPC.carpets.settings.update, carpetSettingsUpdateSchema, (data) => {
    const settings = ctx.carpetSettings.update(data);
    ctx.notifyDataChanged();
    return settings;
  });

  // Remindere — două liste simple, calculate la cerere (FĂRĂ scheduler pentru Covoare):
  // comenzi gata de livrat (de anunțat clientul) și clienți „de recontactat".
  handle(IPC.carpets.reminders.get, null, () => {
    const settings = ctx.carpetSettings.get();
    const cutoff =
      settings.revisit_months != null
        ? addMonthsClamped(ctx.todayIso(), -settings.revisit_months)
        : null;
    return {
      settings,
      readyToNotify: settings.notify_on_ready ? ctx.carpetOrders.listByStatus('gata', 50) : [],
      revisitDue: cutoff ? ctx.carpetClients.listForRevisit(cutoff, 50) : [],
    };
  });

  // Mesaje — istoricul jurnalului propriu Covoare (carpet_message_logs).
  handle(IPC.carpets.messages.list, carpetMessageListFilterSchema, (filter) =>
    ctx.carpetMessages.list(filter),
  );

  // Situația agregată a unui client — „adunate per client” (vezi getClientGroup): toate
  // comenzile lui, folosită de panoul de detaliu (click pe rândul din Comenzi) și de
  // butonul de WhatsApp agregat. Trimiterea efectivă rămâne pe `carpets.whatsapp.send` de
  // mai jos (aceeași comandă asistată, un singur `client_id` — orice client din grup are
  // ACELAȘI telefon normalizat, deci funcționează indiferent care client_id se trimite).
  handle(IPC.carpets.clientSituation.get, carpetClientIdSchema, ({ client_id }) => {
    const group = ctx.carpetOrders.getClientGroup(client_id);
    if (!group) throw new UserFacingError('Clientul nu a fost găsit.');
    return group;
  });

  handle(IPC.carpets.clientSituation.preview, carpetClientIdSchema, ({ client_id }) => {
    const group = ctx.carpetOrders.getClientGroup(client_id);
    if (!group) throw new UserFacingError('Clientul nu a fost găsit.');
    if (group.open_orders.length === 0) {
      throw new UserFacingError('Acest client nu are comenzi deschise în acest moment.');
    }
    const company = ctx.settings.get().company;
    return { body: buildCarpetClientSituationMessage(group, company.phone) };
  });

  // WhatsApp — mod asistat: deschide wa.me cu mesajul pregătit; trimiterea rămâne manuală
  // (niciodată automată). Vezi tyres.ipc.ts pentru același tipar.
  handle(IPC.carpets.whatsapp.send, carpetWhatsappSendSchema, async ({ client_id, message }) => {
    const client = ctx.carpetClients.getById(client_id);
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

    ctx.carpetMessages.insertLog({
      client_id: client.id,
      recipient: client.phone,
      message_preview: message,
    });
    ctx.logger.info(`WhatsApp asistat deschis pentru client covoare #${client.id}`);
    return { opened: true };
  });
}
