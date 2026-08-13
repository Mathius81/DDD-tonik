import fs from 'node:fs';
import path from 'node:path';
import { backup , DatabaseSync } from 'node:sqlite';
import type { AppContext } from '../app-context';
import { Db } from '../db/database';
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
  constructor(private ctx: AppContext) {}

  private backupDir(): string {
    const custom = this.ctx.settings.get().backup.custom_folder;
    if (custom && fs.existsSync(custom)) return custom;
    return this.ctx.paths.backupsDir;
  }

  /** Nume: ddd-manager-2026-08-13-140500.sqlite (spec #49). */
  private backupFileName(): string {
    const d = this.ctx.now();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `ddd-manager-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.sqlite`;
  }

  async create(): Promise<BackupInfo> {
    const dest = path.join(this.backupDir(), this.backupFileName());
    await backup(this.ctx.db.raw, dest);
    const stat = fs.statSync(dest);
    this.ctx.logger.info(`Backup creat: ${dest} (${stat.size} bytes)`);
    this.applyRetention();
    return {
      file: dest,
      name: path.basename(dest),
      created_at: this.ctx.nowLocalIso(),
      size_bytes: stat.size,
    };
  }

  /** Backup automat: o dată pe zi, la prima pornire/activitate din zi (spec #49). */
  async autoBackupIfNeeded(): Promise<void> {
    const settings = this.ctx.settings.get();
    if (!settings.backup.auto_backup) return;
    const today = this.ctx.todayIso();
    const last = this.ctx.settings.getRaw(LAST_AUTO_BACKUP_KEY);
    if (last === today) return;
    await this.create();
    this.ctx.settings.setRaw(LAST_AUTO_BACKUP_KEY, today);
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
          created_at: stat.mtime.toISOString().replace('T', ' ').slice(0, 19),
          size_bytes: stat.size,
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name));
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
   * Restore (spec #50):
   * 1. validează backup-ul selectat; 2. face backup bazei actuale;
   * 3. închide conexiunea; 4. înlocuiește fișierul; 5. verifică integritatea;
   * 6. redeschide și repornește aplicația.
   * `fileName` este DOAR numele fișierului dintr-un folder controlat de noi —
   * renderer-ul nu poate trimite căi arbitrare.
   */
  async restore(fileName: string, reopenDb: (db: Db) => void, relaunch: () => void): Promise<void> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new UserFacingError('Nume de backup invalid.');
    }
    const source = path.join(this.backupDir(), fileName);
    if (!fs.existsSync(source)) throw new UserFacingError('Backup-ul selectat nu există.');

    // 1. Validare: fișierul e o bază SQLite integră.
    this.verifyIntegrity(source);

    // 2. Backup de siguranță al bazei actuale.
    await this.create();

    // 3-4. Închidem conexiunea și înlocuim fișierul.
    const dbFile = this.ctx.paths.dbFile;
    this.ctx.db.close();
    for (const suffix of ['-wal', '-shm']) {
      const f = `${dbFile}${suffix}`;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    fs.copyFileSync(source, dbFile);

    // 5. Verificare finală + redeschidere.
    this.verifyIntegrity(dbFile);
    const newDb = new Db(dbFile);
    reopenDb(newDb);
    this.ctx.logger.info(`Backup restaurat din ${fileName}; aplicația repornește`);

    // 6. Repornim ca toate modulele să pornească curat pe noua bază.
    relaunch();
  }

  private verifyIntegrity(file: string): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(file, { readOnly: true });
      const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') {
        throw new Error(`integrity_check: ${result.integrity_check}`);
      }
    } catch (err) {
      throw new UserFacingError('Fișierul de backup este deteriorat sau nu este o bază validă.');
    } finally {
      db?.close();
    }
  }
}
