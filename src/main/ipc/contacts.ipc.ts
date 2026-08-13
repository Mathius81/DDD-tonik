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
