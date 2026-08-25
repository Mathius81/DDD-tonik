import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  carpetClientCreateSchema,
  carpetClientUpdateSchema,
  carpetClientListFilterSchema,
  carpetOrderCreateSchema,
  carpetOrderUpdateSchema,
  carpetOrderListFilterSchema,
  carpetOrderSetStatusSchema,
} from '../../shared/schemas/carpet';
import { idSchema } from '../../shared/schemas/common';
import type { AppContext } from '../app-context';

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
    const client = ctx.carpetClients.getById(data.client_id);
    if (!client) throw new UserFacingError('Clientul selectat nu există.');
    const order = ctx.carpetOrders.create(data);
    ctx.logger.info(`Comandă covoare creată: #${order.id} pentru ${client.name}`);
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
}
