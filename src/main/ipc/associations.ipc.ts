import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  associationCreateSchema,
  associationUpdateSchema,
  associationListFilterSchema,
} from '../../shared/schemas/association';
import { idSchema } from '../../shared/schemas/common';
import type { AppContext } from '../app-context';

export function registerAssociationHandlers(ctx: AppContext): void {
  handle(IPC.associations.list, associationListFilterSchema, (filter) =>
    ctx.associations.list(filter),
  );

  handle(IPC.associations.get, z.object({ id: idSchema }), ({ id }) => {
    const association = ctx.associations.getById(id);
    if (!association) throw new UserFacingError('Asociația nu a fost găsită.');
    return {
      association,
      contacts: ctx.contacts.listByAssociation(id),
      followups: ctx.followups.list(
        { association_id: id, status: 'all', window: 'all', page: 1, pageSize: 50 },
        ctx.todayIso(),
      ).items,
      interventions: ctx.interventions.list({ association_id: id, page: 1, pageSize: 50 }).items,
      messages: ctx.messages.listLogs({ association_id: id, status: 'all', page: 1, pageSize: 50 })
        .items,
    };
  });

  handle(IPC.associations.create, associationCreateSchema, (data) => {
    const created = ctx.associations.create(data);
    ctx.logger.info(`Asociație creată: #${created.id} ${created.name}`);
    return created;
  });

  handle(IPC.associations.update, associationUpdateSchema, (data) => ctx.associations.update(data));

  handle(
    IPC.associations.setActive,
    z.object({ id: idSchema, active: z.boolean() }),
    ({ id, active }) => {
      // Dezactivarea NU șterge istoricul — doar oprește reminderele (spec #9, #52).
      ctx.associations.setActive(id, active);
      return ctx.associations.getById(id);
    },
  );
}
