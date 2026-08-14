import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import type { AppContext } from '../app-context';
import type { LicenseService } from '../services/license.service';

const activateSchema = z.object({ token: z.string().trim().min(10).max(2000) });

export function registerLicenseHandlers(ctx: AppContext, license: LicenseService): void {
  handle(IPC.license.check, null, () => license.check());

  handle(IPC.license.activate, activateSchema, ({ token }) => {
    try {
      const state = license.activate(token);
      ctx.notifyDataChanged();
      return state;
    } catch (err) {
      throw new UserFacingError(err instanceof Error ? err.message : 'Cheia nu este validă.');
    }
  });
}
