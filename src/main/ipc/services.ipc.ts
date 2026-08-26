/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import { serviceCreateSchema, serviceUpdateSchema } from '../../shared/schemas/service';
import type { AppContext } from '../app-context';

export function registerServiceHandlers(ctx: AppContext): void {
  handle(IPC.services.list, null, () => ctx.services.list());
  handle(IPC.services.create, serviceCreateSchema, (data) => ctx.services.create(data));
  handle(IPC.services.update, serviceUpdateSchema, (data) => ctx.services.update(data));
}
