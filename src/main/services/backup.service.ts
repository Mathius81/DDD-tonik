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
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { format } from 'date-fns';
import { AppContext } from '../app-context';
import { Db } from '../db/database';
import { migrations } from '../db/migrations';
import { UserFacingError } from '../ipc/register';

export interface BackupInfo {
  file: string;
  name: string;
  created_at: string;
  size_bytes: number;
}

const LAST_AUTO_BACKUP_KEY = 'last_auto_backup_date';

/**
 * Backup prin SQLite Online Backup API (spec #48) — niciodată copy simplu
 * al fișierului cât timp există tranzacții active.
 */
export class BackupService {
  private pendingOperation: Promise<void> = Promise.resolve();

  constructor(private ctx: AppContext) {}

  private backupDir(): string {
    const custom = this.ctx.settings.get().backup.custom_folder;
    if (custom && fs.existsSync(custom)) return custom;
    return this.ctx.paths.backupsDir;
  }

  /** Serializăm operațiile: o altă creare nu poate aplica retenția în timpul restaurării. */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pendingOperation.then(operation);
    this.pendingOperation = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Numele local păstrează formatul existent; coliziunile primesc un sufix numeric. */
  private backupFileName(dir: string): string {
    const d = this.ctx.now();
    const pad = (n: number) => String(n).padStart(2, '0');
    const base = `ddd-manager-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    // Nu reutilizăm primul gol lăsat de retenție: ar părea mai vechi decât copiile
    // rămase și noul backup ar putea fi șters imediat. Continuăm după sufixul maxim.
    let maxSuffix = -1;
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const pattern = new RegExp(`^${base}(?:-(\\d+))?\\.sqlite$`);
      for (const name of fs.readdirSync(dir)) {
        const match = name.match(pattern);
        if (match && !fs.statSync(path.join(dir, name)).isDirectory()) {
          maxSuffix = Math.max(maxSuffix, Number(match[1] ?? 0));
        }
      }
    }
    return maxSuffix < 0 ? `${base}.sqlite` : `${base}-${maxSuffix + 1}.sqlite`;
  }

  create(): Promise<BackupInfo> {
    return this.serialize(() => this.createBackup(true));
  }

  private async createBackup(withRetention: boolean): Promise<BackupInfo> {
    const dir = this.backupDir();
    const dest = path.join(dir, this.backupFileName(dir));
    try {
      await backup(this.ctx.db.raw, dest);
    } catch (err) {
      // O copie incompletă nu trebuie confundată ulterior cu un backup utilizabil.
      try {
        if (fs.existsSync(dest) && fs.statSync(dest).isFile()) fs.unlinkSync(dest);
      } catch (cleanupError) {
        this.ctx.logger.warn(`Nu am putut șterge copia incompletă ${dest}`, cleanupError);
      }
      throw err;
    }
    const stat = fs.statSync(dest);
    this.ctx.logger.info(`Backup creat: ${dest} (${stat.size} bytes)`);
    if (withRetention) this.applyRetention();
    return {
      file: dest,
      name: path.basename(dest),
      created_at: this.ctx.nowLocalIso(),
      size_bytes: stat.size,
    };
  }

  /** Backup automat: o dată pe zi, la prima pornire/activitate din zi (spec #49). */
  autoBackupIfNeeded(): Promise<void> {
    return this.serialize(async () => {
      const settings = this.ctx.settings.get();
      if (!settings.backup.auto_backup) return;
      const today = this.ctx.todayIso();
      const last = this.ctx.settings.getRaw(LAST_AUTO_BACKUP_KEY);
      if (last === today) return;
      await this.createBackup(true);
      this.ctx.settings.setRaw(LAST_AUTO_BACKUP_KEY, today);
    });
  }

  list(): BackupInfo[] {
    const dir = this.backupDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('ddd-manager-') && f.endsWith('.sqlite'))
      .map((name) => {
        const file = path.join(dir, name);
        const stat = fs.statSync(file);
        return {
          file,
          name,
          created_at: format(stat.mtime, 'yyyy-MM-dd HH:mm:ss'),
          size_bytes: stat.size,
        };
      })
      // Fără extensie, copia fără sufix precedă -1; numeric, -10 este mai nouă decât -9.
      .sort((a, b) => b.name.slice(0, -7).localeCompare(a.name.slice(0, -7), undefined, { numeric: true }));
  }

  private applyRetention(): void {
    const keep = this.ctx.settings.get().backup.keep_last;
    const backups = this.list();
    for (const b of backups.slice(keep)) {
      try {
        fs.unlinkSync(b.file);
        this.ctx.logger.info(`Backup vechi șters (retenție ${keep}): ${b.name}`);
      } catch (err) {
        this.ctx.logger.warn(`Nu am putut șterge backup-ul vechi ${b.name}`, err);
      }
    }
  }

  /**
   * Restore (spec #50): validăm integritatea și schema, apoi facem o copie de siguranță
   * FĂRĂ retenție. Păstrăm și fișierul original până la redeschiderea reușită: o copiere
   * întreruptă poate lăsa destinația incompletă, nu doar să arunce înainte de a o atinge.
   * `fileName` este DOAR numele fișierului dintr-un folder controlat de noi —
   * renderer-ul nu poate trimite căi arbitrare.
   */
  restore(fileName: string, reopenDb: (db: Db) => void, relaunch: () => void): Promise<void> {
    return this.serialize(() => this.restoreBackup(fileName, reopenDb, relaunch));
  }

  private async restoreBackup(fileName: string, reopenDb: (db: Db) => void, relaunch: () => void): Promise<void> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new UserFacingError('Nume de backup invalid.');
    }
    const source = path.join(this.backupDir(), fileName);
    if (!fs.existsSync(source)) throw new UserFacingError('Backup-ul selectat nu există.');
    this.verifyIntegrity(source);

    // Retenția normală revine la următoarea creare, nu în timpul acestei restaurări.
    const safety = await this.createBackup(false);
    const dbFile = this.ctx.paths.dbFile;
    // Același volum permite mutarea originalului fără o a doua copiere costisitoare.
    const recoveryDir = fs.mkdtempSync(path.join(path.dirname(dbFile), '.tonik-restaurare-'));
    const originalFile = path.join(recoveryDir, path.basename(dbFile));
    let closed = false;
    let moved = false;
    let restored = false;
    let newDb: Db | undefined;

    try {
      // Ștergerea WAL este sigură doar după confirmarea că datele au ajuns în baza
      // principală; un alt cititor SQLite poate împiedica checkpoint-ul la close().
      const checkpoint = this.ctx.db.get<{ busy: number }>('PRAGMA wal_checkpoint(TRUNCATE)');
      if (checkpoint?.busy !== 0) {
        throw new UserFacingError('Baza de date este ocupată. Reîncearcă restaurarea după încheierea celorlalte operații.');
      }
      this.ctx.db.close();
      closed = true;
      this.removeSidecars(dbFile);
      fs.renameSync(dbFile, originalFile);
      moved = true;
      fs.copyFileSync(source, dbFile);
      this.verifyIntegrity(dbFile);
      newDb = new Db(dbFile);
      this.reopenContext(newDb, reopenDb);
      restored = true;
    } catch (err) {
      if (closed) {
        try {
          newDb?.close();
          if (moved) {
            this.removeSidecars(dbFile);
            fs.renameSync(originalFile, dbFile);
            moved = false;
          }
          this.reopenContext(new Db(dbFile), reopenDb);
        } catch (recoveryError) {
          this.ctx.logger.error(`Restaurare și redeschidere eșuate; original: ${originalFile}; copie de siguranță: ${safety.file}`, { err, recoveryError });
          throw new UserFacingError(`Restaurarea a eșuat și baza nu a putut fi redeschisă. Copia de siguranță este păstrată în ${safety.file}.`);
        }
      }
      throw err;
    } finally {
      // Nu ștergem originalul dacă și recuperarea a eșuat.
      if (restored || !moved) {
        try {
          fs.rmSync(recoveryDir, { recursive: true, force: true });
        } catch (cleanupError) {
          this.ctx.logger.warn(`Nu am putut curăța folderul temporar ${recoveryDir}`, cleanupError);
        }
      }
    }

    this.ctx.logger.info(`Backup restaurat din ${fileName}; aplicația repornește`);
    relaunch();
  }

  private reopenContext(db: Db, reopenDb: (db: Db) => void): void {
    // Serviciile păstrează ctx, iar repository-urile păstrează Db. Reconstruim toate
    // repository-urile prin constructorul comun, dar păstrăm identitatea contextului.
    // Callback-ul existent singur schimbă doar ctx.db, lăsând restul pe baza închisă.
    Object.assign(this.ctx, new AppContext(
      db, this.ctx.paths, this.ctx.logger, this.ctx.getMainWindow, this.ctx.now,
    ));
    reopenDb(db);
  }

  private removeSidecars(dbFile: string): void {
    for (const suffix of ['-wal', '-shm']) {
      const file = `${dbFile}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  private verifyIntegrity(file: string): void {
    let db: DatabaseSync | null = null;
    let integrityOk = false;
    const schemaError = 'Fișierul de backup nu conține o schemă Tonik recunoscută.';
    try {
      db = new DatabaseSync(file, { readOnly: true });
      const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') {
        throw new Error(`integrity_check: ${result.integrity_check}`);
      }
      integrityOk = true;
      const tables = db.prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('associations', 'schema_migrations')",
      ).all();
      if (tables.length !== 2) throw new UserFacingError(schemaError);
      // Nu este suficientă existența unor tabele cu aceleași nume.
      db.prepare('SELECT id, name, address FROM associations LIMIT 0').all();
      const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
      const supported = [...migrations].sort((a, b) => a.version - b.version);
      if (applied.some((row) => row.version > supported[supported.length - 1].version)) {
        throw new UserFacingError('Backup-ul provine dintr-o versiune Tonik mai nouă. Actualizează aplicația înainte de restaurare.');
      }
      if (applied.length === 0 || applied.some((row, i) => row.version !== supported[i]?.version)) {
        throw new UserFacingError(schemaError);
      }
    } catch (err) {
      if (err instanceof UserFacingError) throw err;
      throw new UserFacingError(integrityOk ? schemaError : 'Fișierul de backup este deteriorat sau nu este o bază validă.');
    } finally {
      db?.close();
    }
  }
}
