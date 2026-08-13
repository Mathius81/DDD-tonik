import { DatabaseSync } from 'node:sqlite';

/**
 * Wrapper subțire peste node:sqlite.
 * Punct unic de schimbare dacă vom trece la better-sqlite3.
 */
export class Db {
  readonly raw: DatabaseSync;

  constructor(readonly file: string) {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');
  }

  run(sql: string, ...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
    return this.raw.prepare(sql).run(...(params as never[]));
  }

  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Rulează `fn` într-o tranzacție. Comite la succes, face rollback la orice eroare.
   * Suportă imbricare prin savepoints.
   */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) {
      const name = `sp_${++this.savepointCounter}`;
      this.raw.exec(`SAVEPOINT ${name}`);
      try {
        const result = fn();
        this.raw.exec(`RELEASE ${name}`);
        return result;
      } catch (err) {
        this.raw.exec(`ROLLBACK TO ${name}`);
        this.raw.exec(`RELEASE ${name}`);
        throw err;
      }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = fn();
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  private inTransaction = false;
  private savepointCounter = 0;

  close(): void {
    this.raw.close();
  }
}
