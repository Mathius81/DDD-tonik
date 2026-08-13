import { handle } from './register';
import { IPC } from '../../shared/ipc-contract';
import { serviceCreateSchema, serviceUpdateSchema } from '../../shared/schemas/service';
import type { AppContext } from '../app-context';

export function registerServiceHandlers(ctx: AppContext): void {
  handle(IPC.services.list, null, () => ctx.services.list());
  handle(IPC.services.create, serviceCreateSchema, (data) => ctx.services.create(data));
  handle(IPC.services.update, serviceUpdateSchema, (data) => ctx.services.update(data));
}
