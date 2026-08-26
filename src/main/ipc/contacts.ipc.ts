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
import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import { contactCreateSchema, contactUpdateSchema } from '../../shared/schemas/contact';
import { idSchema } from '../../shared/schemas/common';
import type { AppContext } from '../app-context';

export function registerContactHandlers(ctx: AppContext): void {
  handle(IPC.contacts.listByAssociation, z.object({ association_id: idSchema }), ({ association_id }) =>
    ctx.contacts.listByAssociation(association_id),
  );

  handle(IPC.contacts.create, contactCreateSchema, (data) => ctx.contacts.create(data));

  handle(IPC.contacts.update, contactUpdateSchema, (data) => ctx.contacts.update(data));

  handle(IPC.contacts.delete, z.object({ id: idSchema }), ({ id }) => {
    ctx.contacts.softDelete(id);
    return { deleted: true };
  });
}
