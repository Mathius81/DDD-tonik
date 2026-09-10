/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Numai efectele Electron/OS și pornirea sarcinilor periodice sunt simulate.
// Bootstrap, SQLite, migrațiile și backupul pre-migrație rămân reale.
vi.mock('electron', () => ({ safeStorage: {}, ipcMain: { handle: vi.fn() } }));
vi.mock('../../src/main/ipc', () => ({ registerAllIpcHandlers: vi.fn() }));
vi.mock('../../src/main/tray', () => ({ createTray: vi.fn() }));

import { bootstrap, type BootstrapResult } from '../../src/main/bootstrap';
import { Db } from '../../src/main/db/database';
import { currentSchemaVersion, migrations } from '../../src/main/db/migrations';
import { BackupService } from '../../src/main/services/backup.service';
import { SchedulerService } from '../../src/main/services/scheduler.service';
import { StartupService } from '../../src/main/services/startup.service';
import { Logger } from '../../src/main/logger';
import type { AppPaths } from '../../src/main/paths';

describe('Bootstrap — backup numai înaintea migrațiilor efectiv necesare', () => {
  let director: string;
  let paths: AppPaths;
  let logger: Logger;
  let pornire: BootstrapResult | undefined;

  beforeEach(() => {
    director = fs.mkdtempSync(path.join(os.tmpdir(), 'tonik-bootstrap-test-'));
    paths = { dataDir: director, backupsDir: path.join(director, 'backup-uri'), logsDir: path.join(director, 'jurnale'), dbFile: path.join(director, 'test.sqlite') };
    fs.mkdirSync(paths.backupsDir);
    fs.mkdirSync(paths.logsDir);
    logger = new Logger(paths.logsDir);
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(SchedulerService.prototype, 'start').mockImplementation(() => {});
    vi.spyOn(StartupService.prototype, 'apply').mockImplementation(() => {});
    vi.spyOn(BackupService.prototype, 'autoBackupIfNeeded').mockResolvedValue();
  });
  afterEach(() => {
    try { pornire?.ctx.db.close(); } finally {
      pornire = undefined;
      fs.rmSync(director, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  function bazaLaVersiunea(versiune: number) {
    const db = new Db(paths.dbFile);
    try {
      db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
      for (const migrare of migrations.filter((m) => m.version <= versiune)) {
        db.transaction(() => {
          migrare.up(db);
          db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', migrare.version, migrare.name);
        });
      }
    } finally { db.close(); }
  }

  async function porneste() {
    pornire = await bootstrap({ paths, logger, getMainWindow: () => null, quit: vi.fn() });
    return pornire;
  }

  it('REGRESIE P2: trei porniri cu schema la zi nu consumă retenția prin copii pre-migrație', async () => {
    const ultima = migrations[migrations.length - 1].version;
    bazaLaVersiunea(ultima);
    const creeaza = vi.spyOn(BackupService.prototype, 'create');
    for (let i = 0; i < 3; i++) {
      const rezultat = await porneste();
      expect(currentSchemaVersion(rezultat.ctx.db)).toBe(ultima);
      if (i < 2) { rezultat.ctx.db.close(); pornire = undefined; }
    }
    expect(creeaza).not.toHaveBeenCalled();
    expect(fs.readdirSync(paths.backupsDir)).toEqual([]);
    expect(pornire!.ctx.settings.getRaw('app_run_count')).toBe('3');
  });

  it('schema anterioară produce exact o copie cu versiunea veche, apoi aplică ultima migrație', async () => {
    const penultima = migrations[migrations.length - 2].version;
    bazaLaVersiunea(penultima);
    const creeaza = vi.spyOn(BackupService.prototype, 'create');
    const rezultat = await porneste();
    expect(creeaza).toHaveBeenCalledTimes(1);
    const fisiere = fs.readdirSync(paths.backupsDir);
    expect(fisiere).toHaveLength(1);
    const copie = new DatabaseSync(path.join(paths.backupsDir, fisiere[0]), { readOnly: true });
    try {
      expect(copie.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toEqual({ v: penultima });
    } finally { copie.close(); }
    expect(currentSchemaVersion(rezultat.ctx.db)).toBe(migrations[migrations.length - 1].version);
  });

  it('instalarea nouă aplică schema fără backup pre-migrație al unei baze goale', async () => {
    const creeaza = vi.spyOn(BackupService.prototype, 'create');
    const rezultat = await porneste();
    expect(creeaza).not.toHaveBeenCalled();
    expect(currentSchemaVersion(rezultat.ctx.db)).toBe(migrations[migrations.length - 1].version);
  });
});
