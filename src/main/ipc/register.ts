import { ipcMain } from 'electron';
import type { ZodType } from 'zod';
import type { Logger } from '../logger';
import type { IpcResult } from '../../shared/ipc-contract';

let loggerRef: Logger | null = null;

export function setIpcLogger(logger: Logger): void {
  loggerRef = logger;
}

/**
 * Înregistrează un handler IPC cu validare zod obligatorie.
 * Orice payload invalid este respins înainte să atingă logica de business.
 * Erorile tehnice se loghează local; utilizatorul primește un mesaj simplu.
 */
export function handle<In, Out>(
  channel: string,
  schema: ZodType<In> | null,
  fn: (input: In) => Out | Promise<Out>,
): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<Out>> => {
    try {
      let input: In;
      if (schema) {
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          loggerRef?.warn(`IPC ${channel}: payload invalid — ${parsed.error.message}`);
          return { ok: false, error: 'Datele trimise nu sunt valide.' };
        }
        input = parsed.data;
      } else {
        input = undefined as In;
      }
      const data = await fn(input);
      return { ok: true, data };
    } catch (err) {
      loggerRef?.error(`IPC ${channel}: eroare`, err);
      return {
        ok: false,
        error: err instanceof UserFacingError ? err.message : 'A apărut o eroare. Încearcă din nou.',
      };
    }
  });
}

/** Eroare al cărei mesaj poate fi afișat utilizatorului. */
export class UserFacingError extends Error {}
