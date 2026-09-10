/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, setLoginItemSettings: vi.fn() },
}));
// Exercităm ramura Squirrel cu semantica reală a căilor Windows și pe macOS/Linux.
vi.mock('node:path', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:path')>();
  return { ...original, default: original.win32 };
});

import { app } from 'electron';
import { Logger } from '../../src/main/logger';
import { StartupService } from '../../src/main/services/startup.service';

const platformaInitiala = Object.getOwnPropertyDescriptor(process, 'platform')!;
const executabilInitial = Object.getOwnPropertyDescriptor(process, 'execPath')!;

describe('StartupService — configurare login items fără modificarea sistemului gazdă', () => {
  let serviciu: StartupService;
  let logger: Logger;

  beforeEach(() => {
    vi.mocked(app.setLoginItemSettings).mockReset();
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true });
    logger = new Logger('');
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    serviciu = new StartupService(logger);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', platformaInitiala);
    Object.defineProperty(process, 'execPath', executabilInitial);
    vi.restoreAllMocks();
  });

  it.each([true, false])('Windows instalat, activare=%s: țintește Update.exe, nu executabilul versionat', (activat) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'execPath', {
      value: 'C:\\Utilizatori\\Ștefan O\'Brien\\Tonik\\app-1.2.3\\Tonik Manager.exe',
    });
    Object.defineProperty(app, 'isPackaged', { value: true });

    serviciu.apply(activat);

    expect(app.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({
      openAtLogin: activat,
      path: 'C:\\Utilizatori\\Ștefan O\'Brien\\Tonik\\Update.exe',
      args: ['--processStart', '"Tonik Manager.exe"', '--process-start-args', '"--hidden"'],
    });
    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      `Pornire cu sistemul: ${activat ? 'activată' : 'dezactivată'}`,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['win32', false, true],
    ['win32', false, false],
    ['darwin', true, true],
    ['darwin', true, false],
    ['linux', true, true],
  ] as const)('%s, instalat=%s, activare=%s: nu transmite argumente Squirrel în afara Windows instalat', (platforma, instalat, activat) => {
    Object.defineProperty(process, 'platform', { value: platforma });
    Object.defineProperty(app, 'isPackaged', { value: instalat });
    serviciu.apply(activat);
    expect(app.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({ openAtLogin: activat });
  });

  it('refuzul sistemului este jurnalizat cu eroarea originală, fără mesaj fals de succes', () => {
    const eroare = new Error('Acces refuzat la elementele de autentificare');
    vi.mocked(app.setLoginItemSettings).mockImplementationOnce(() => { throw eroare; });
    serviciu.apply(true);
    expect(app.setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('Nu am putut seta pornirea cu sistemul', eroare);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
