import { app } from 'electron';
import path from 'node:path';
import type { Logger } from '../logger';

/**
 * Pornirea odată cu Windows (spec #22).
 * Cu instalare Squirrel, ținta trebuie să fie Update.exe cu --processStart,
 * nu exe-ul versionat direct.
 */
export class StartupService {
  constructor(private logger: Logger) {}

  apply(enabled: boolean): void {
    try {
      if (process.platform === 'win32' && app.isPackaged) {
        const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
        const exeName = path.basename(process.execPath);
        app.setLoginItemSettings({
          openAtLogin: enabled,
          path: updateExe,
          args: ['--processStart', `"${exeName}"`, '--process-start-args', '"--hidden"'],
        });
      } else {
        app.setLoginItemSettings({ openAtLogin: enabled });
      }
      this.logger.info(`Pornire cu sistemul: ${enabled ? 'activată' : 'dezactivată'}`);
    } catch (err) {
      this.logger.warn('Nu am putut seta pornirea cu sistemul', err);
    }
  }
}
