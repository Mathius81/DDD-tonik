/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(channel, fn);
      }),
    },
    app: {
      getVersion: vi.fn(() => '1.2.3'),
      getAppPath: vi.fn(() => '/tmp/nu-e-setat-inca'),
      isPackaged: false,
    },
    shell: { openPath: vi.fn(async () => '') },
  };
});

vi.mock('electron', () => ({
  ipcMain: electronMock.ipcMain,
  app: electronMock.app,
  shell: electronMock.shell,
}));

import { app, shell } from 'electron';
import { createTestDb, seedBasics } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import type { AppPaths } from '../../src/main/paths';
import { AppContext } from '../../src/main/app-context';
import { LicenseService } from '../../src/main/services/license.service';
import { registerAboutHandlers } from '../../src/main/ipc/about.ipc';
import { saveIntervention } from '../../src/main/domain/followup-engine';
import { defaultReminderRules } from '../../src/shared/schemas/reminder';
import { IPC } from '../../src/shared/ipc-contract';
import type { IpcResult } from '../../src/shared/ipc-contract';
import type {
  AboutDiagnostics,
  AboutSecretMenuStatus,
  AboutSecretMenuVerifyResult,
  AboutStats,
} from '../../src/shared/schemas/about';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

describe('about.ipc', () => {
  let db: Db;
  let cleanup: () => void;
  let dir: string;
  let appRootDir: string;
  let paths: AppPaths;
  let ctx: AppContext;
  let license: LicenseService;
  let ids: { associationId: number; contactId: number; serviceId: number };

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    ids = seedBasics(db);

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-about-'));
    paths = {
      dataDir: dir,
      backupsDir: path.join(dir, 'backups'),
      logsDir: path.join(dir, 'logs'),
      dbFile: path.join(dir, 'data', 'ddd-manager.sqlite'),
    };
    fs.mkdirSync(paths.backupsDir, { recursive: true });
    fs.mkdirSync(paths.logsDir, { recursive: true });

    // Folder separat, care simulează rădăcina proiectului (`app.getAppPath()`)
    // — acolo caută handlerele THIRD-PARTY-LICENSES.txt când aplicația NU e
    // împachetată (`app.isPackaged === false`).
    appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-about-root-'));

    ctx = new AppContext(db, paths, silentLogger, () => null, () => new Date('2026-08-20T09:00:00'));
    license = new LicenseService(ctx, silentLogger, ctx.now);

    electronMock.handlers.clear();
    vi.mocked(app.getVersion).mockClear();
    vi.mocked(app.getAppPath).mockClear().mockReturnValue(appRootDir);
    electronMock.app.isPackaged = false;
    vi.mocked(shell.openPath).mockClear().mockResolvedValue('');

    registerAboutHandlers(ctx, license);
  });

  afterEach(() => {
    cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(appRootDir, { recursive: true, force: true });
  });

  async function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const fn = electronMock.handlers.get(channel);
    if (!fn) throw new Error(`Handler neînregistrat: ${channel}`);
    return (await fn({}, payload)) as IpcResult<T>;
  }

  describe('about:logRendererError', () => {
    // `silentLogger` e tipat `as never` mai sus doar ca să treacă de tipurile
    // constructorului `AppContext`; obiectul de dedesubt tot are `vi.fn()`.
    const loggerSpy = silentLogger as unknown as { error: ReturnType<typeof vi.fn> };

    it('scrie eroarea neprevăzută din renderer în log, cu mesaj și rută', async () => {
      const result = await invoke<{ logged: boolean }>(IPC.about.logRendererError, {
        message: 'Cannot read properties of null (reading value)',
        stack: 'Error: boom\n    at Componenta (App.tsx:10:5)',
        route: '/ddd/asociatii/12',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.logged).toBe(true);
      expect(loggerSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot read properties of null (reading value)'),
        'Error: boom\n    at Componenta (App.tsx:10:5)',
      );
      expect(loggerSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('/ddd/asociatii/12'),
        expect.anything(),
      );
    });

    it('acceptă un payload minimal, fără stivă sau rută', async () => {
      const result = await invoke<{ logged: boolean }>(IPC.about.logRendererError, {
        message: 'eroare fără mai multe detalii',
      });
      expect(result.ok).toBe(true);
      expect(loggerSpy.error).toHaveBeenCalledWith(expect.stringContaining('eroare fără mai multe detalii'), undefined);
    });

    it('respinge un payload fără mesaj', async () => {
      const result = await invoke(IPC.about.logRendererError, { stack: 'doar stivă' });
      expect(result.ok).toBe(false);
    });
  });

  describe('about:diagnostics', () => {
    it('numără rândurile din toate tabelele relevante și include versiunea schemei', async () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-08-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-08-01',
      );

      const result = await invoke<AboutDiagnostics>(IPC.about.diagnostics);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.tableCounts.associations).toBe(1);
      expect(result.data.tableCounts.contacts).toBe(1);
      expect(result.data.tableCounts.interventions).toBe(1);
      expect(result.data.tableCounts.carpetClients).toBe(0);
      expect(result.data.tableCounts.tyreClients).toBe(0);
      expect(result.data.schemaVersion).toBeGreaterThan(0);
      expect(result.data.dbPath).toBe(paths.dbFile);
      expect(result.data.logsPath).toBe(paths.logsDir);
      expect(result.data.license.status).toBe('missing');
      expect(result.data.lastBackup).toBeNull();
      expect(result.data.recentErrors).toEqual([]);
    });

    it('găsește ultimul backup după numele fișierului, dintre mai multe', async () => {
      fs.writeFileSync(path.join(paths.backupsDir, 'ddd-manager-2026-08-10.sqlite'), 'x');
      fs.writeFileSync(path.join(paths.backupsDir, 'ddd-manager-2026-08-19.sqlite'), 'xyz');
      fs.writeFileSync(path.join(paths.backupsDir, 'altceva.txt'), 'nu conteaza');

      const result = await invoke<AboutDiagnostics>(IPC.about.diagnostics);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.lastBackup?.name).toBe('ddd-manager-2026-08-19.sqlite');
      expect(result.data.lastBackup?.sizeBytes).toBe(3);
    });

    it.each([
      ['2026-09-10T21:30:00Z', '2026-09-11 00:30:00'],
      ['2026-01-10T21:30:00Z', '2026-01-10 23:30:00'],
    ])('REGRESIE P2: ultimul backup din Despre afișează ora locală pentru %s', async (utc, local) => {
      vi.stubEnv('TZ', 'Europe/Bucharest');
      try {
        const fisier = path.join(paths.backupsDir, 'ddd-manager-test-local.sqlite');
        fs.writeFileSync(fisier, 'copie de test');
        fs.utimesSync(fisier, new Date(utc), new Date(utc));
        const result = await invoke<AboutDiagnostics>(IPC.about.diagnostics);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.data.lastBackup?.createdAt).toBe(local);
      } finally { vi.unstubAllEnvs(); }
    });

    it('citește doar ultimele linii ERROR din logul zilei curente', async () => {
      // `readRecentErrors` se uită la data REALĂ de sistem (logul de azi, pentru un
      // telefon de suport chiar acum) — nu la `ctx.now()`, care e fixat mai sus pentru
      // celelalte calcule din test.
      const azi = new Date().toISOString().slice(0, 10);
      const logFile = path.join(paths.logsDir, `ddd-${azi}.log`);
      const lines = Array.from({ length: 25 }, (_, i) => `[${azi} 09:0${i % 6}:00] ERROR eroare ${i}`);
      lines.splice(5, 0, `[${azi} 09:00:00] INFO ceva normal, nu e eroare`);
      fs.writeFileSync(logFile, lines.join('\n'));

      const result = await invoke<AboutDiagnostics>(IPC.about.diagnostics);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.recentErrors).toHaveLength(20);
      expect(result.data.recentErrors.every((l) => l.includes('] ERROR '))).toBe(true);
      expect(result.data.recentErrors[19]).toContain('eroare 24');
    });
  });

  describe('about:stats', () => {
    it('calculează totalurile, luna cea mai aglomerată și clientul cu cele mai multe lucrări', async () => {
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-07-05',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-07-05',
      );
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-08-01',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-08-01',
      );
      saveIntervention(
        db,
        {
          association_id: ids.associationId,
          service_id: ids.serviceId,
          performed_date: '2026-08-02',
          interval_months: 3,
          notes: null,
          completes_followup_id: null,
        },
        defaultReminderRules,
        '2026-08-02',
      );
      db.run(
        `INSERT INTO message_logs (association_id, channel, recipient, message_preview, status)
         VALUES (${ids.associationId}, 'email', 'test@test.ro', 'text', 'confirmed_sent')`,
      );
      db.run(
        `INSERT INTO message_logs (association_id, channel, recipient, message_preview, status)
         VALUES (${ids.associationId}, 'email', 'test@test.ro', 'text', 'failed')`,
      );

      const result = await invoke<AboutStats>(IPC.about.stats);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.data.totalInterventions).toBe(3);
      expect(result.data.totalMessagesSent).toBe(1);
      expect(result.data.busiestMonth).toEqual({ month: '2026-08', count: 2 });
      expect(result.data.topAssociation).toEqual({ name: 'Asociația Bloc A7', count: 3 });
      expect(result.data.monthlyAverage).toBeCloseTo(1.5, 5); // 3 intervenții / 2 luni distincte
    });
  });

  describe('about:resetReportGuard', () => {
    it('șterge marcajul „trimis azi” al raportului indicat', async () => {
      ctx.settings.setRaw('last_daily_digest_date::ddd_dimineata', '2026-08-20');

      const result = await invoke(IPC.about.resetReportGuard, { report: 'ddd_dimineata' });
      expect(result.ok).toBe(true);
      expect(ctx.settings.getRaw('last_daily_digest_date::ddd_dimineata')).toBeUndefined();
    });

    it('respinge un identificator de raport necunoscut', async () => {
      const result = await invoke(IPC.about.resetReportGuard, { report: 'nu_exista' });
      expect(result.ok).toBe(false);
    });
  });

  describe('about:openLogsFolder / about:openBackupsFolder', () => {
    it('deschide folderul de loguri prin shell.openPath', async () => {
      const result = await invoke(IPC.about.openLogsFolder);
      expect(result.ok).toBe(true);
      expect(shell.openPath).toHaveBeenCalledWith(paths.logsDir);
    });

    it('deschide folderul de backup implicit prin shell.openPath', async () => {
      const result = await invoke(IPC.about.openBackupsFolder);
      expect(result.ok).toBe(true);
      expect(shell.openPath).toHaveBeenCalledWith(paths.backupsDir);
    });

    it('raportează eroare clară dacă shell.openPath eșuează', async () => {
      vi.mocked(shell.openPath).mockResolvedValueOnce('nu am gasit folderul');
      const result = await invoke(IPC.about.openLogsFolder);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('nu am gasit folderul');
    });
  });

  describe('about:thirdPartyLicenses', () => {
    const thirdPartyFile = () => path.join(appRootDir, 'THIRD-PARTY-LICENSES.txt');

    function writeFixture(): void {
      const content =
        'Antet explicativ, ignorat de parser.\n' +
        '\n<<<TONIK-THIRD-PARTY-PACKAGE>>>\n' +
        'Pachet: zod@4.4.3\n' +
        'Licență: MIT\n' +
        'Copyright: Copyright (c) Colin McDonnell\n' +
        '---\n' +
        'MIT License\n\nText de test pentru zod.\n' +
        '\n<<<TONIK-THIRD-PARTY-PACKAGE>>>\n' +
        'Pachet: @mantine/core@9.5.1\n' +
        'Licență: MIT\n' +
        'Copyright: Copyright (c) Vitaly Rtishchev\n' +
        '---\n' +
        'MIT License\n\nText de test pentru mantine, cu @ în numele pachetului.\n';
      fs.writeFileSync(thirdPartyFile(), content);
    }

    it('list: raportează fileFound=false dacă THIRD-PARTY-LICENSES.txt lipsește', async () => {
      const result = await invoke<{ fileFound: boolean; packages: unknown[] }>(IPC.about.thirdPartyLicenses.list);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.fileFound).toBe(false);
      expect(result.data.packages).toEqual([]);
    });

    it('list: citește pachetele din fișier, inclusiv un pachet scoped (@scope/nume)', async () => {
      writeFixture();
      const result = await invoke<{
        fileFound: boolean;
        packages: { name: string; version: string; license: string; copyright: string }[];
      }>(IPC.about.thirdPartyLicenses.list);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.fileFound).toBe(true);
      expect(result.data.packages).toHaveLength(2);
      expect(result.data.packages[0]).toEqual({
        name: 'zod',
        version: '4.4.3',
        license: 'MIT',
        copyright: 'Copyright (c) Colin McDonnell',
      });
      // Numele scoped conține propriul „@” — trebuie separat corect de versiune.
      expect(result.data.packages[1]).toEqual({
        name: '@mantine/core',
        version: '9.5.1',
        license: 'MIT',
        copyright: 'Copyright (c) Vitaly Rtishchev',
      });
    });

    it('getText: întoarce textul integral pentru un pachet existent', async () => {
      writeFixture();
      const result = await invoke<{ found: boolean; text: string }>(IPC.about.thirdPartyLicenses.getText, {
        name: '@mantine/core',
        version: '9.5.1',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.found).toBe(true);
      expect(result.data.text).toContain('Text de test pentru mantine');
    });

    it('getText: found=false pentru un pachet necunoscut sau dacă fișierul lipsește', async () => {
      writeFixture();
      const necunoscut = await invoke<{ found: boolean; text: string }>(IPC.about.thirdPartyLicenses.getText, {
        name: 'nu-exista',
        version: '1.0.0',
      });
      expect(necunoscut.ok).toBe(true);
      if (necunoscut.ok) {
        expect(necunoscut.data.found).toBe(false);
        expect(necunoscut.data.text).toBe('');
      }

      fs.rmSync(thirdPartyFile());
      const faraFisier = await invoke<{ found: boolean; text: string }>(IPC.about.thirdPartyLicenses.getText, {
        name: 'zod',
        version: '4.4.3',
      });
      expect(faraFisier.ok).toBe(true);
      if (faraFisier.ok) expect(faraFisier.data.found).toBe(false);
    });

    it('getText: respinge un payload invalid (fără nume/versiune)', async () => {
      const result = await invoke(IPC.about.thirdPartyLicenses.getText, { name: '' });
      expect(result.ok).toBe(false);
    });

    it('openFile: deschide fișierul prin shell.openPath dacă există', async () => {
      writeFixture();
      const result = await invoke(IPC.about.thirdPartyLicenses.openFile);
      expect(result.ok).toBe(true);
      expect(shell.openPath).toHaveBeenCalledWith(thirdPartyFile());
    });

    it('openFile: eroare clară dacă fișierul nu există', async () => {
      const result = await invoke(IPC.about.thirdPartyLicenses.openFile);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain('THIRD-PARTY-LICENSES.txt');
      expect(shell.openPath).not.toHaveBeenCalled();
    });
  });

  describe('about:get', () => {
    it('include versiunea aplicației și numărul de asociații/intervenții', async () => {
      const result = await invoke<{ version: string; associations: number; interventions: number }>(
        IPC.about.get,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.version).toBe('1.2.3');
      expect(result.data.associations).toBe(1);
    });
  });

  describe('meniul secret — poarta cu parolă', () => {
    it('la instalare nouă nu există încă o parolă setată', async () => {
      const status = await invoke<AboutSecretMenuStatus>(IPC.about.secretMenuStatus);
      expect(status.ok).toBe(true);
      if (!status.ok) return;
      expect(status.data.hasPassword).toBe(false);
      expect(status.data.lockedUntil).toBeNull();
    });

    it('setează parola prima dată — status.hasPassword devine true', async () => {
      const set = await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      expect(set.ok).toBe(true);

      const status = await invoke<AboutSecretMenuStatus>(IPC.about.secretMenuStatus);
      expect(status.ok).toBe(true);
      if (!status.ok) return;
      expect(status.data.hasPassword).toBe(true);
    });

    it('nu permite setarea parolei a doua oară (trebuie schimbată, nu resetată)', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      const second = await invoke(IPC.about.secretMenuSetPassword, { password: 'alta-parola' });
      expect(second.ok).toBe(false);
    });

    it('hash-ul stocat NU este parola în clar', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      const salt = ctx.settings.getRaw('secret_menu_password_salt');
      const hash = ctx.settings.getRaw('secret_menu_password_hash');
      expect(salt).toBeDefined();
      expect(hash).toBeDefined();
      expect(hash).not.toBe('parola-buna');
      expect(hash).not.toContain('parola-buna');
    });

    it('sarea diferă între două setări ale aceleiași parole (instanțe independente)', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'aceeasi-parola' });
      const salt1 = ctx.settings.getRaw('secret_menu_password_salt');
      const hash1 = ctx.settings.getRaw('secret_menu_password_hash');

      // A doua instanță, complet independentă — bază de date proprie.
      const t2 = createTestDb();
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ddd-about-2-'));
      const paths2: AppPaths = {
        dataDir: dir2,
        backupsDir: path.join(dir2, 'backups'),
        logsDir: path.join(dir2, 'logs'),
        dbFile: path.join(dir2, 'data', 'ddd-manager.sqlite'),
      };
      fs.mkdirSync(paths2.backupsDir, { recursive: true });
      fs.mkdirSync(paths2.logsDir, { recursive: true });
      const ctx2 = new AppContext(t2.db, paths2, silentLogger, () => null, () => new Date('2026-08-20T09:00:00'));
      const license2 = new LicenseService(ctx2, silentLogger, ctx2.now);
      // Suprascrie handlerele mock cu cele ale ctx2, pentru acest apel.
      registerAboutHandlers(ctx2, license2);

      try {
        const set2 = await invoke(IPC.about.secretMenuSetPassword, { password: 'aceeasi-parola' });
        expect(set2.ok).toBe(true);
        const salt2 = ctx2.settings.getRaw('secret_menu_password_salt');
        const hash2 = ctx2.settings.getRaw('secret_menu_password_hash');

        expect(salt1).not.toBe(salt2);
        expect(hash1).not.toBe(hash2);
      } finally {
        t2.cleanup();
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });

    it('verifică cu succes parola corectă', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      const rez = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
        password: 'parola-buna',
      });
      expect(rez.ok).toBe(true);
      if (!rez.ok) return;
      expect(rez.data.success).toBe(true);
      expect(rez.data.lockedUntil).toBeNull();
    });

    it('respinge o parolă greșită, fără să blocheze imediat', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      const rez = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
        password: 'gresita',
      });
      expect(rez.ok).toBe(true);
      if (!rez.ok) return;
      expect(rez.data.success).toBe(false);
      expect(rez.data.lockedUntil).toBeNull();
      expect(rez.data.attemptsLeft).toBe(4);
    });

    it('blochează ecranul de parolă după 5 încercări greșite consecutive', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });

      let ultim: IpcResult<AboutSecretMenuVerifyResult> | null = null;
      for (let i = 0; i < 5; i += 1) {
        ultim = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'gresita',
        });
      }
      expect(ultim?.ok).toBe(true);
      if (!ultim || !ultim.ok) return;
      expect(ultim.data.success).toBe(false);
      expect(ultim.data.lockedUntil).not.toBeNull();

      // Chiar cu parola corectă, cât timp e blocat, verificarea eșuează.
      const cuParolaCorecta = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
        password: 'parola-buna',
      });
      expect(cuParolaCorecta.ok).toBe(true);
      if (!cuParolaCorecta.ok) return;
      expect(cuParolaCorecta.data.success).toBe(false);
      expect(cuParolaCorecta.data.lockedUntil).not.toBeNull();
    });

    it('deblochează automat după expirarea celor 60 de secunde', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      for (let i = 0; i < 5; i += 1) {
        await invoke(IPC.about.secretMenuVerifyPassword, { password: 'gresita' });
      }
      const status = await invoke<AboutSecretMenuStatus>(IPC.about.secretMenuStatus);
      expect(status.ok).toBe(true);
      if (!status.ok) return;
      expect(status.data.lockedUntil).not.toBeNull();

      const acumSpy = vi.spyOn(Date, 'now').mockReturnValue((status.data.lockedUntil as number) + 1_000);
      try {
        const rez = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'parola-buna',
        });
        expect(rez.ok).toBe(true);
        if (!rez.ok) return;
        expect(rez.data.success).toBe(true);
      } finally {
        acumSpy.mockRestore();
      }
    });

    it('resetează contorul de încercări greșite la o introducere corectă', async () => {
      await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-buna' });
      await invoke(IPC.about.secretMenuVerifyPassword, { password: 'gresita' });
      await invoke(IPC.about.secretMenuVerifyPassword, { password: 'gresita' });

      const corect = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
        password: 'parola-buna',
      });
      expect(corect.ok).toBe(true);
      if (!corect.ok) return;
      expect(corect.data.success).toBe(true);

      // După succes, contorul a fost resetat — mai sunt nevoie de 5 greșeli noi pentru blocaj.
      for (let i = 0; i < 4; i += 1) {
        const r = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'gresita',
        });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.data.lockedUntil).toBeNull();
      }
    });

    describe('schimbarea parolei', () => {
      it('schimbă parola cu succes când parola veche este corectă', async () => {
        await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-veche' });

        const schimbare = await invoke(IPC.about.secretMenuChangePassword, {
          oldPassword: 'parola-veche',
          newPassword: 'parola-noua',
        });
        expect(schimbare.ok).toBe(true);

        const verifVeche = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'parola-veche',
        });
        expect(verifVeche.ok).toBe(true);
        if (verifVeche.ok) expect(verifVeche.data.success).toBe(false);

        const verifNoua = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'parola-noua',
        });
        expect(verifNoua.ok).toBe(true);
        if (verifNoua.ok) expect(verifNoua.data.success).toBe(true);
      });

      it('respinge schimbarea dacă parola veche este greșită — parola rămâne neschimbată', async () => {
        await invoke(IPC.about.secretMenuSetPassword, { password: 'parola-veche' });

        const schimbare = await invoke(IPC.about.secretMenuChangePassword, {
          oldPassword: 'gresita',
          newPassword: 'parola-noua',
        });
        expect(schimbare.ok).toBe(false);

        const verifVeche = await invoke<AboutSecretMenuVerifyResult>(IPC.about.secretMenuVerifyPassword, {
          password: 'parola-veche',
        });
        expect(verifVeche.ok).toBe(true);
        if (verifVeche.ok) expect(verifVeche.data.success).toBe(true);
      });
    });
  });
});
