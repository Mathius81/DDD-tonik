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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (valoare: string) => Buffer.from(valoare),
    decryptString: (valoare: Buffer) => valoare.toString(),
  },
}));
// SQLite rămâne REAL, inclusiv API-ul de backup în toate testele de succes.
// Doar eroarea de disc plin este injectată la granița I/O; nu umplem discul gazdei.
vi.mock('node:sqlite', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:sqlite')>();
  return { ...original, backup: vi.fn(original.backup) };
});

import { backup, DatabaseSync } from 'node:sqlite';
import { creeazaContextTest } from '../helpers/app-context';
import { seedBasics } from '../helpers/tmp-db';
import { BackupService } from '../../src/main/services/backup.service';
import { LicenseService } from '../../src/main/services/license.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import type { BackupSettings } from '../../src/shared/schemas/settings';
import { Db } from '../../src/main/db/database';
import { migrations, runMigrations } from '../../src/main/db/migrations';

function citesteCopie(fisier: string) {
  const copie = new DatabaseSync(fisier, { readOnly: true });
  try {
    return {
      integritate: copie.prepare('PRAGMA integrity_check').get(),
      asociatii: copie.prepare('SELECT name, address FROM associations ORDER BY id').all(),
      contacte: copie.prepare('SELECT name, phone, email FROM contacts ORDER BY id').all(),
    };
  } finally {
    copie.close();
  }
}

const discPlin = () => Object.assign(new Error('database or disk is full'), { code: 'ERR_SQLITE_ERROR', errcode: 13 });

describe('BackupService — copii reale, retenție, restaurare și erori I/O izolate', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  let serviciu: BackupService;

  beforeEach(async () => {
    // Vitest rulează în procese separate; fusul se restaurează după fiecare test.
    vi.stubEnv('TZ', 'Europe/Bucharest');
    vi.mocked(backup).mockReset();
    vi.mocked(backup).mockImplementation((await vi.importActual<typeof import('node:sqlite')>('node:sqlite')).backup);
    baza = creeazaContextTest('2026-08-14T08:05:06');
    serviciu = new BackupService(baza.ctx);
  });
  afterEach(() => {
    try { baza.cleanup(); } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
  });

  function configurare(modificari: Partial<BackupSettings>) {
    const setari = baza.ctx.settings.get();
    baza.ctx.settings.save({ ...setari, backup: { ...setari.backup, ...modificari } });
  }

  function restaurare() {
    const etape: string[] = [];
    const redeschide = vi.fn((db: Db) => { baza.ctx.db = db; etape.push('redeschidere'); });
    // Nu apelăm Electron app.relaunch(): aplicația utilizatorului rămâne deschisă.
    const reporneste = vi.fn(() => { etape.push('repornire'); });
    return { redeschide, reporneste, etape };
  }

  it('baza goală produce tot o copie SQLite validă, cu nume local, dimensiune reală și metadate complete', async () => {
    expect(serviciu.list()).toEqual([]);
    const copie = await serviciu.create();
    expect(copie).toEqual({
      file: path.join(baza.ctx.paths.backupsDir, 'ddd-manager-2026-08-14-080506.sqlite'),
      name: 'ddd-manager-2026-08-14-080506.sqlite', created_at: '2026-08-14 08:05:06',
      size_bytes: fs.statSync(copie.file).size,
    });
    expect(copie.size_bytes).toBeGreaterThan(0);
    expect(citesteCopie(copie.file)).toEqual({ integritate: { integrity_check: 'ok' }, asociatii: [], contacte: [] });
    expect(backup).toHaveBeenCalledExactlyOnceWith(baza.ctx.db.raw, copie.file);
  });

  it('copia păstrează conținutul din WAL și nu se schimbă odată cu baza activă', async () => {
    const { ctx } = baza;
    const { associationId } = seedBasics(ctx.db);
    ctx.db.run('UPDATE associations SET name = ? WHERE id = ?', "Ștefan O'Brien <script>& ăâîșț", associationId);
    const copie = await serviciu.create();
    ctx.db.run("UPDATE associations SET name = 'Modificat după backup'");
    ctx.db.run("INSERT INTO associations (name, address) VALUES ('Asociație nouă', 'Altă adresă')");
    expect(citesteCopie(copie.file)).toEqual({
      integritate: { integrity_check: 'ok' },
      asociatii: [{ name: "Ștefan O'Brien <script>& ăâîșț", address: 'Str. Exemplu nr. 10' }],
      contacte: [{ name: 'Ion Popescu', phone: '0712345678', email: 'ion@example.ro' }],
    });
    expect(ctx.db.get('SELECT COUNT(*) AS n FROM associations')).toEqual({ n: 2 });
  });

  it.each([1, 2])('keep_last=%i păstrează exact cele mai recente copii și nu șterge fișiere fără semnătura de backup', async (cate) => {
    configurare({ keep_last: cate });
    const director = baza.ctx.paths.backupsDir;
    for (const nume of ['document.sqlite', 'ddd-manager-notițe.txt']) fs.writeFileSync(path.join(director, nume), 'Nu șterge');
    const numeCopii: string[] = [];
    for (const zi of ['12', '13', '14']) {
      baza.schimbaOra(`2026-08-${zi}T08:05:06`);
      numeCopii.push((await serviciu.create()).name);
    }
    expect(serviciu.list().map((c) => c.name)).toEqual(numeCopii.slice(-cate).reverse());
    for (const nume of numeCopii.slice(0, -cate)) expect(fs.existsSync(path.join(director, nume))).toBe(false);
    for (const nume of ['document.sqlite', 'ddd-manager-notițe.txt']) expect(fs.readFileSync(path.join(director, nume), 'utf8')).toBe('Nu șterge');
  });

  it('folosește folderul custom existent, inclusiv la listare și retenție, fără să atingă folderul implicit', async () => {
    const implicit = await serviciu.create();
    const custom = path.join(baza.ctx.paths.dataDir, "Copii Ștefan O'Brien");
    fs.mkdirSync(custom);
    configurare({ custom_folder: custom, keep_last: 1 });
    const prima = await serviciu.create();
    baza.schimbaOra('2026-08-15T08:05:06');
    const ultima = await serviciu.create();
    expect(path.dirname(ultima.file)).toBe(custom);
    expect(serviciu.list().map((c) => c.file)).toEqual([ultima.file]);
    expect(fs.existsSync(prima.file)).toBe(false);
    expect(fs.existsSync(implicit.file)).toBe(true);
    expect(citesteCopie(ultima.file).integritate).toEqual({ integrity_check: 'ok' });
  });

  it('folderul custom inexistent revine la cel implicit, fără să pretindă că a creat directorul ales', async () => {
    const inexistent = path.join(baza.ctx.paths.dataDir, 'Director dispărut', 'copii');
    configurare({ custom_folder: inexistent });
    const copie = await serviciu.create();
    expect(path.dirname(copie.file)).toBe(baza.ctx.paths.backupsDir);
    expect(serviciu.list().map((c) => c.file)).toEqual([copie.file]);
    expect(fs.existsSync(inexistent)).toBe(false);
  });

  it('folderul implicit dispărut dă listă goală și eroare reală de creare, fără a marca backupul zilnic drept făcut', async () => {
    seedBasics(baza.ctx.db);
    fs.rmdirSync(baza.ctx.paths.backupsDir);
    expect(serviciu.list()).toEqual([]);
    await expect(serviciu.autoBackupIfNeeded()).rejects.toThrow(/unable to open database/i);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBeUndefined();
    expect(baza.ctx.db.get('SELECT COUNT(*) AS n FROM associations')).toEqual({ n: 1 });
    expect(baza.jurnal.info).not.toHaveBeenCalled();
  });

  it('un fișier ales în loc de folder custom produce eroare reală și nu este suprascris', async () => {
    const fisier = path.join(baza.ctx.paths.dataDir, 'Nu este director');
    fs.writeFileSync(fisier, 'Conținut important');
    configurare({ custom_folder: fisier });
    await expect(serviciu.create()).rejects.toThrow(/unable to open database/i);
    expect(fs.readFileSync(fisier, 'utf8')).toBe('Conținut important');
    expect(fs.readdirSync(baza.ctx.paths.backupsDir)).toEqual([]);
  });

  it('o destinație ocupată de un director nu este tratată ca backup reușit', async () => {
    const destinatie = path.join(baza.ctx.paths.backupsDir, 'ddd-manager-2026-08-14-080506.sqlite');
    fs.mkdirSync(destinatie);
    await expect(serviciu.create()).rejects.toThrow(/unable to open database/i);
    expect(fs.statSync(destinatie).isDirectory()).toBe(true);
    expect(baza.jurnal.info).not.toHaveBeenCalled();
  });

  it('disc plin la copia zilnică: păstrează copia veche și data ultimei reușite, apoi permite reîncercarea', async () => {
    configurare({ keep_last: 1 });
    baza.schimbaOra('2026-08-13T08:05:06');
    await serviciu.autoBackupIfNeeded();
    const veche = serviciu.list()[0];
    baza.schimbaOra('2026-08-14T08:05:06');
    const eroare = discPlin();
    vi.mocked(backup).mockRejectedValueOnce(eroare);
    await expect(serviciu.autoBackupIfNeeded()).rejects.toBe(eroare);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBe('2026-08-13');
    expect(serviciu.list().map((c) => c.file)).toEqual([veche.file]);
    await serviciu.autoBackupIfNeeded();
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBe('2026-08-14');
    expect(serviciu.list().map((c) => c.name)).toEqual(['ddd-manager-2026-08-14-080506.sqlite']);
    expect(fs.existsSync(veche.file)).toBe(false);
  });

  it('un backup vechi blocat la ștergere este jurnalizat, dar nu invalidează copia nouă', async () => {
    configurare({ keep_last: 1 });
    const veche = await serviciu.create();
    baza.schimbaOra('2026-08-15T08:05:06');
    const eroare = Object.assign(new Error('Fișier blocat'), { code: 'EBUSY' });
    const stergeReal = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((fisier) => {
      if (fisier === veche.file) throw eroare;
      return stergeReal(fisier);
    });
    const noua = await serviciu.create();
    expect(citesteCopie(noua.file).integritate).toEqual({ integrity_check: 'ok' });
    expect(serviciu.list().map((c) => c.file)).toEqual([noua.file, veche.file]);
    expect(baza.jurnal.warn).toHaveBeenCalledExactlyOnceWith(`Nu am putut șterge backup-ul vechi ${veche.name}`, eroare);
  });

  it('automatizarea dezactivată nu scrie fișiere și nu consumă ziua, dar backupul manual rămâne disponibil', async () => {
    configurare({ auto_backup: false });
    await serviciu.autoBackupIfNeeded();
    expect(backup).not.toHaveBeenCalled();
    expect(serviciu.list()).toEqual([]);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBeUndefined();
    await serviciu.create();
    expect(serviciu.list()).toHaveLength(1);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBeUndefined();
  });

  it.each([
    ['2026-08-14T00:10:00+03:00', '2026-08-15T00:05:00+03:00', '2026-08-14', '2026-08-15', -180],
    ['2026-12-31T00:10:00+02:00', '2027-01-01T00:05:00+02:00', '2026-12-31', '2027-01-01', -120],
  ] as const)('backupul zilnic folosește ziua României la %s, nu ziua UTC anterioară, și persistă garda după reinstanțiere', async (inceput, urmatoarea, azi, maine, decalaj) => {
    baza.schimbaOra(inceput);
    expect(baza.ctx.now().getTimezoneOffset()).toBe(decalaj);
    expect(baza.ctx.now().toISOString().slice(0, 10)).not.toBe(azi);
    await serviciu.autoBackupIfNeeded();
    await new BackupService(baza.ctx).autoBackupIfNeeded();
    expect(backup).toHaveBeenCalledTimes(1);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBe(azi);
    baza.schimbaOra(urmatoarea);
    await serviciu.autoBackupIfNeeded();
    expect(backup).toHaveBeenCalledTimes(2);
    expect(baza.ctx.settings.getRaw('last_auto_backup_date')).toBe(maine);
    expect(serviciu.list()).toHaveLength(2);
  });

  it.each(['implicit', 'custom'] as const)('restore din folderul %s înlocuiește conținutul, păstrează copia de siguranță și redeschide înainte de repornire', async (folder) => {
    if (folder === 'custom') {
      const custom = path.join(baza.ctx.paths.dataDir, 'Restaurări Ștefan');
      fs.mkdirSync(custom);
      configurare({ custom_folder: custom });
    }
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Modificare de păstrat în siguranță'");
    baza.ctx.db.run("INSERT INTO associations (name, address) VALUES ('Client nou', 'Adresă nouă')");
    baza.schimbaOra('2026-08-14T09:05:06');
    const apeluri = restaurare();
    await serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste);
    expect(apeluri.redeschide).toHaveBeenCalledTimes(1);
    expect(apeluri.reporneste).toHaveBeenCalledTimes(1);
    expect(apeluri.etape).toEqual(['redeschidere', 'repornire']);
    expect(baza.ctx.db.all('SELECT name FROM associations')).toEqual([{ name: 'Asociația Bloc A7' }]);
    expect(baza.ctx.db.get('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    expect(baza.ctx.db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    const siguranta = path.join(path.dirname(sursa.file), 'ddd-manager-2026-08-14-090506.sqlite');
    expect(citesteCopie(siguranta).asociatii).toEqual([
      { name: 'Modificare de păstrat în siguranță', address: 'Str. Exemplu nr. 10' },
      { name: 'Client nou', address: 'Adresă nouă' },
    ]);
    // Conexiunea nouă este și utilizabilă pentru scriere, nu doar un callback apelat.
    baza.ctx.db.run("INSERT INTO associations (name, address) VALUES ('După restore', 'Adresă')");
    expect(baza.ctx.db.get('SELECT COUNT(*) AS n FROM associations')).toEqual({ n: 2 });
  });

  it.each(['../extern.sqlite', '..\\extern.sqlite', '/tmp/extern.sqlite', 'subfolder/copie.sqlite'])('respinge numele necontrolat %s înainte de backup sau închiderea conexiunii', async (nume) => {
    seedBasics(baza.ctx.db);
    const apeluri = restaurare();
    await expect(serviciu.restore(nume, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow('Nume de backup invalid.');
    expect(backup).not.toHaveBeenCalled();
    expect(apeluri.etape).toEqual([]);
    expect(baza.ctx.db.get('SELECT COUNT(*) AS n FROM associations')).toEqual({ n: 1 });
  });

  it.each(['absent', 'deteriorat'] as const)('backup %s: respinge înaintea copiei de siguranță și păstrează baza funcțională', async (caz) => {
    const nume = 'ddd-manager-2026-01-01-090000.sqlite';
    if (caz === 'deteriorat') fs.writeFileSync(path.join(baza.ctx.paths.backupsDir, nume), '<html>Nu este SQLite</html>');
    seedBasics(baza.ctx.db);
    const apeluri = restaurare();
    await expect(serviciu.restore(nume, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow(
      caz === 'absent' ? 'Backup-ul selectat nu există.' : 'Fișierul de backup este deteriorat sau nu este o bază validă.',
    );
    expect(backup).not.toHaveBeenCalled();
    expect(apeluri.etape).toEqual([]);
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
  });

  it('dacă backupul de siguranță eșuează din lipsă de spațiu, restore nu închide și nu înlocuiește baza curentă', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Modificare actuală'");
    baza.schimbaOra('2026-08-14T09:05:06');
    const apeluri = restaurare();
    const eroare = discPlin();
    vi.mocked(backup).mockRejectedValueOnce(eroare);
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toBe(eroare);
    expect(apeluri.etape).toEqual([]);
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Modificare actuală' });
    expect(citesteCopie(sursa.file).asociatii[0]).toMatchObject({ name: 'Asociația Bloc A7' });
  });

  // Retenția nu se aplică la copia de siguranță: sursa restaurării rămâne intactă.
  it('REGRESIE: restore cu keep_last=1 nu își șterge sursa înainte de copiere', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    configurare({ keep_last: 1 });
    baza.ctx.db.run("UPDATE associations SET name = 'Stare nouă'");
    baza.schimbaOra('2026-08-14T09:05:06');
    const apeluri = restaurare();
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).resolves.toBeUndefined();
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
    expect(citesteCopie(sursa.file).asociatii[0].name).toBe('Asociația Bloc A7');
    const siguranta = path.join(path.dirname(sursa.file), 'ddd-manager-2026-08-14-090506.sqlite');
    expect(citesteCopie(siguranta).asociatii[0].name).toBe('Stare nouă');
  });

  // Sufixul numeric separă snapshot-ul ales de copia de siguranță din aceeași secundă.
  it('REGRESIE: restore în aceeași secundă nu suprascrie snapshot-ul selectat cu starea curentă', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Modificare după snapshot'");
    const apeluri = restaurare();
    await serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste);
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
    expect(citesteCopie(sursa.file).asociatii[0].name).toBe('Asociația Bloc A7');
    const siguranta = path.join(path.dirname(sursa.file), 'ddd-manager-2026-08-14-080506-1.sqlite');
    expect(citesteCopie(siguranta).asociatii[0].name).toBe('Modificare după snapshot');
  });

  // EBUSY este injectat numai la copyFileSync; nu simulăm un lacăt al sistemului gazdă.
  // Restaurarea trebuie să redeschidă originalul înainte să propage eroarea.
  it('REGRESIE: fișierul blocat la restore nu trebuie să lase aplicația cu baza închisă', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.schimbaOra('2026-08-14T09:05:06');
    const eroare = Object.assign(new Error('Fișier blocat'), { code: 'EBUSY' });
    const copiazaReal = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((din, spre, mod) => {
      if (din === sursa.file && spre === baza.ctx.paths.dbFile) throw eroare;
      return copiazaReal(din, spre, mod);
    });
    const apeluri = restaurare();
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toBe(eroare);
    expect(apeluri.reporneste).not.toHaveBeenCalled();
    // Ecranele folosesc repository-urile existente, nu numai ctx.db.
    expect(() => baza.ctx.settings.get()).not.toThrow();
    expect(() => baza.ctx.db.get('SELECT name FROM associations')).not.toThrow();
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
  });

  it.each(['licență', 'secrete'] as const)('REGRESIE P0: %s funcționează fără repornire după restaurarea eșuată cu recuperare', async (caz) => {
    const { ctx } = baza;
    const setariInitiale = ctx.settings;
    // Instanțele există deja, ca la bootstrap; nu le reconstruim după restaurare.
    const licenta = new LicenseService(ctx, ctx.logger, ctx.now);
    const secrete = new SecretsService(ctx);
    const mesagerie = new MessagingService(ctx, secrete);
    // Verificarea semnăturii are teste proprii; aici verificăm accesul la SQLite.
    vi.spyOn(licenta, 'parseToken').mockReturnValue('2027-08-14');
    licenta.activate('cheie-fictivă-pentru-test');
    secrete.set('smtp_password', 'parolă-fictivă-veche');
    const sursa = await serviciu.create();
    secrete.set('smtp_password', 'parolă-fictivă-actuală');
    const eroare = discPlin();
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw eroare; });
    const apeluri = restaurare();

    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toBe(eroare);
    expect(apeluri.reporneste).not.toHaveBeenCalled();
    // Comparăm identitatea fără ca Vitest să inspecteze handle-ul SQLite închis.
    expect(ctx.settings === setariInitiale).toBe(false);
    expect(() => setariInitiale.get()).toThrow();
    if (caz === 'licență') {
      expect(licenta.check()).toMatchObject({ status: 'valid', expiresAt: '2027-08-14' });
      expect(licenta.activate('cheie-fictivă-nouă').status).toBe('valid');
      expect(ctx.settings.getRaw('license_token')).toBe('cheie-fictivă-nouă');
    } else {
      expect(secrete.get('smtp_password')).toBe('parolă-fictivă-actuală');
      expect(() => mesagerie.emailProvider()).not.toThrow();
      expect(() => mesagerie.whatsappProvider()).not.toThrow();
      secrete.set('whatsapp_access_token', 'token-fictiv');
      expect(secrete.get('whatsapp_access_token')).toBe('token-fictiv');
      secrete.delete('smtp_password');
      expect(secrete.get('smtp_password')).toBeNull();
    }
  });

  // Integritatea SQLite singură nu dovedește că fișierul aparține aplicației Tonik.
  it('REGRESIE: o bază SQLite integră dar fără schema Tonik este refuzată înainte de înlocuire', async () => {
    seedBasics(baza.ctx.db);
    const nume = 'ddd-manager-2026-01-01-090000.sqlite';
    const straina = new DatabaseSync(path.join(baza.ctx.paths.backupsDir, nume));
    try { straina.exec('CREATE TABLE alta_aplicatie (id INTEGER PRIMARY KEY)'); } finally { straina.close(); }
    const apeluri = restaurare();
    await expect(serviciu.restore(nume, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow('Fișierul de backup nu conține o schemă Tonik recunoscută.');
    expect(backup).not.toHaveBeenCalled();
    expect(apeluri.etape).toEqual([]);
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
  });

  // Ora listată și ora creării rămân locale, inclusiv lângă miezul nopții și iarna.
  it.each([
    ['2026-08-14T00:10:00+03:00', '2026-08-14 00:10:00', -180],
    ['2027-01-01T00:10:00+02:00', '2027-01-01 00:10:00', -120],
  ] as const)('REGRESIE: listarea copiei de la %s păstrează aceeași oră și zi locală ca rezultatul creării', async (ora, local, decalaj) => {
    baza.schimbaOra(ora);
    expect(baza.ctx.now().getTimezoneOffset()).toBe(decalaj);
    const copie = await serviciu.create();
    // mtime controlat pe fișier REAL: ceasul injectat în ctx nu schimbă ceasul OS.
    fs.utimesSync(copie.file, baza.ctx.now(), baza.ctx.now());
    expect(copie.created_at).toBe(local);
    expect(serviciu.list()[0].created_at).toBe(local);
  });

  it('12 copii în aceeași secundă au nume distincte, iar retenția ordonează numeric sufixele', async () => {
    seedBasics(baza.ctx.db);
    configurare({ keep_last: 2 });
    const nume: string[] = [];
    for (let i = 0; i < 12; i++) {
      baza.ctx.db.run('UPDATE associations SET name = ?', `Stare ${i}`);
      nume.push((await serviciu.create()).name);
    }
    expect(new Set(nume).size).toBe(12);
    expect(serviciu.list().map((c) => c.name)).toEqual([
      'ddd-manager-2026-08-14-080506-11.sqlite', 'ddd-manager-2026-08-14-080506-10.sqlite',
    ]);
    expect(serviciu.list().map((c) => citesteCopie(c.file).asociatii[0].name)).toEqual(['Stare 11', 'Stare 10']);
  });

  it('creările simultane sunt serializate și nu aleg aceeași destinație', async () => {
    const copii = await Promise.all([serviciu.create(), serviciu.create(), serviciu.create()]);
    expect(new Set(copii.map((c) => c.file)).size).toBe(3);
    expect(serviciu.list().map((c) => c.name)).toEqual(copii.map((c) => c.name).reverse());
    for (const copie of copii) expect(citesteCopie(copie.file).integritate).toEqual({ integrity_check: 'ok' });
  });

  it('două solicitări automate simultane nu dublează copia zilei', async () => {
    await Promise.all([serviciu.autoBackupIfNeeded(), serviciu.autoBackupIfNeeded()]);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(serviciu.list()).toHaveLength(1);
  });

  it('copia de backup incompletă este eliminată fără retenție, iar reîncercarea poate reuși', async () => {
    configurare({ keep_last: 1 });
    const veche = await serviciu.create();
    baza.schimbaOra('2026-08-15T08:05:06');
    const eroare = discPlin();
    vi.mocked(backup).mockImplementationOnce(async (_db, dest) => {
      fs.writeFileSync(dest, 'Copie incompletă');
      throw eroare;
    });
    await expect(serviciu.create()).rejects.toBe(eroare);
    expect(serviciu.list().map((c) => c.file)).toEqual([veche.file]);
    const noua = await serviciu.create();
    expect(citesteCopie(noua.file).integritate).toEqual({ integrity_check: 'ok' });
    expect(serviciu.list().map((c) => c.file)).toEqual([noua.file]);
  });

  it.each(['eroare I/O', 'copie coruptă'] as const)('recuperează starea actuală, nu snapshot-ul vechi, după %s care a modificat deja destinația', async (caz) => {
    const { associationId } = seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Ultima stare nesalvată în sursă'");
    const eroare = Object.assign(new Error('Copiere întreruptă'), { code: 'EIO' });
    const copiazaReal = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((din, spre, mod) => {
      if (din === sursa.file && spre === baza.ctx.paths.dbFile) {
        fs.writeFileSync(spre, 'Copie trunchiată după închiderea bazei');
        if (caz === 'eroare I/O') throw eroare;
        return;
      }
      return copiazaReal(din, spre, mod);
    });
    const apeluri = restaurare();
    const rezultat = serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste);
    if (caz === 'eroare I/O') await expect(rezultat).rejects.toBe(eroare);
    else await expect(rezultat).rejects.toThrow('Fișierul de backup este deteriorat sau nu este o bază validă.');
    expect(apeluri.etape).toEqual(['redeschidere']);
    expect(baza.ctx.associations.getById(associationId)?.name).toBe('Ultima stare nesalvată în sursă');
    expect(baza.ctx.db.get('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    expect(baza.ctx.db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(baza.ctx.db.get("SELECT unaccent_ro('Ploiești') AS nume")).toEqual({ nume: 'ploiesti' });
    // Verifică și repository-urile refăcute: se poate crea alt backup după eroare.
    const dupaEroare = await serviciu.create();
    expect(citesteCopie(dupaEroare.file).asociatii[0].name).toBe('Ultima stare nesalvată în sursă');
    expect(citesteCopie(sursa.file).asociatii[0].name).toBe('Asociația Bloc A7');
    expect(fs.readdirSync(baza.ctx.paths.dataDir).some((n) => n.startsWith('.tonik-restaurare-'))).toBe(false);
  });

  it('eroarea la mutarea originalului redeschide baza chiar dacă înlocuirea nu a început', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    const eroare = Object.assign(new Error('Original blocat'), { code: 'EBUSY' });
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw eroare; });
    const apeluri = restaurare();
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toBe(eroare);
    expect(apeluri.etape).toEqual(['redeschidere']);
    expect(() => baza.ctx.settings.get()).not.toThrow();
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
  });

  it('un cititor care blochează checkpoint-ul nu permite ștergerea WAL sau închiderea bazei', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    const cititor = new DatabaseSync(baza.ctx.paths.dbFile, { readOnly: true });
    try {
      cititor.exec('BEGIN');
      cititor.prepare('SELECT name FROM associations').all();
      baza.ctx.db.run("UPDATE associations SET name = 'Modificare numai în WAL'");
      baza.ctx.db.exec('PRAGMA busy_timeout = 0');
      const apeluri = restaurare();
      await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow('Baza de date este ocupată.');
      expect(apeluri.etape).toEqual([]);
      expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Modificare numai în WAL' });
      expect(() => baza.ctx.settings.get()).not.toThrow();
    } finally {
      cititor.close();
    }
  });

  it.each(['versiune viitoare', 'istoric gol', 'migrație lipsă', 'coloane străine'] as const)('refuză schema cu %s înainte de backupul de siguranță', async (caz) => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    const copie = new DatabaseSync(sursa.file);
    try {
      if (caz === 'versiune viitoare') copie.exec("INSERT INTO schema_migrations (version, name) VALUES (999, 'viitoare')");
      if (caz === 'istoric gol') copie.exec('DELETE FROM schema_migrations');
      if (caz === 'migrație lipsă') copie.exec('DELETE FROM schema_migrations WHERE version = 2');
      if (caz === 'coloane străine') copie.exec('ALTER TABLE associations RENAME COLUMN address TO camp_strain');
    } finally { copie.close(); }
    const apeluri = restaurare();
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow(
      caz === 'versiune viitoare' ? 'Backup-ul provine dintr-o versiune Tonik mai nouă.' : 'Fișierul de backup nu conține o schemă Tonik recunoscută.',
    );
    expect(backup).toHaveBeenCalledTimes(1);
    expect(apeluri.etape).toEqual([]);
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
  });

  it('acceptă un backup Tonik cu schema inițială, care rămâne migrabil prin migrațiile deja existente', async () => {
    const nume = 'ddd-manager-2025-01-01-090000.sqlite';
    const veche = new Db(path.join(baza.ctx.paths.backupsDir, nume));
    try {
      veche.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
      migrations[0].up(veche);
      veche.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', migrations[0].version, migrations[0].name);
      seedBasics(veche);
    } finally { veche.close(); }
    const apeluri = restaurare();
    await serviciu.restore(nume, apeluri.redeschide, apeluri.reporneste);
    expect(apeluri.etape).toEqual(['redeschidere', 'repornire']);
    expect(baza.ctx.db.get('SELECT MAX(version) AS v FROM schema_migrations')).toEqual({ v: 1 });
    // Simulează numai pe baza temporară migrarea de la repornirea reală a aplicației.
    expect(runMigrations(baza.ctx.db)).toEqual(migrations.slice(1).map((m) => m.version));
    expect(baza.ctx.db.get('SELECT name FROM associations')).toEqual({ name: 'Asociația Bloc A7' });
    expect(() => baza.ctx.settings.get()).not.toThrow();
  });

  it('o creare concurentă așteaptă restaurarea și nu poate aplica retenția asupra sursei în curs', async () => {
    configurare({ keep_last: 1 });
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Stare înainte de restore'");
    let continua!: () => void;
    const blocaj = new Promise<void>((resolve) => { continua = resolve; });
    const backupReal = (await vi.importActual<typeof import('node:sqlite')>('node:sqlite')).backup;
    vi.mocked(backup).mockImplementationOnce(async (...args) => {
      await blocaj;
      return backupReal(...args);
    });
    const apeluri = restaurare();
    apeluri.reporneste.mockImplementation(() => {
      expect(citesteCopie(sursa.file).asociatii[0].name).toBe('Asociația Bloc A7');
      apeluri.etape.push('repornire');
    });
    const restaurata = serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste);
    const urmatoarea = serviciu.create();
    await Promise.resolve();
    expect(backup).toHaveBeenCalledTimes(2); // sursa + copia de siguranță încă blocată
    continua();
    const [, copie] = await Promise.all([restaurata, urmatoarea]);
    expect(apeluri.etape).toEqual(['redeschidere', 'repornire']);
    expect(citesteCopie(copie.file).asociatii[0].name).toBe('Asociația Bloc A7');
    expect(serviciu.list().map((c) => c.file)).toEqual([copie.file]);
  });

  it('dacă sistemul blochează și recuperarea, păstrează originalul și copia de siguranță și spune explicit că baza nu s-a redeschis', async () => {
    seedBasics(baza.ctx.db);
    const sursa = await serviciu.create();
    baza.ctx.db.run("UPDATE associations SET name = 'Date actuale păstrate pentru recuperare'");
    const mutaReal = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((din, spre) => {
      if (din !== baza.ctx.paths.dbFile) throw new Error('Recuperare blocată');
      return mutaReal(din, spre);
    });
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw new Error('Copiere blocată'); });
    const apeluri = restaurare();
    await expect(serviciu.restore(sursa.name, apeluri.redeschide, apeluri.reporneste)).rejects.toThrow('Restaurarea a eșuat și baza nu a putut fi redeschisă.');
    expect(apeluri.etape).toEqual([]);
    const director = fs.readdirSync(baza.ctx.paths.dataDir).find((n) => n.startsWith('.tonik-restaurare-'))!;
    const original = path.join(baza.ctx.paths.dataDir, director, path.basename(baza.ctx.paths.dbFile));
    expect(citesteCopie(original).asociatii[0].name).toBe('Date actuale păstrate pentru recuperare');
    const siguranta = path.join(baza.ctx.paths.backupsDir, 'ddd-manager-2026-08-14-080506-1.sqlite');
    expect(citesteCopie(siguranta).asociatii[0].name).toBe('Date actuale păstrate pentru recuperare');
    expect(citesteCopie(sursa.file).asociatii[0].name).toBe('Asociația Bloc A7');
    expect(baza.jurnal.error).toHaveBeenCalledTimes(1);
  });
});
