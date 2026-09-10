/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/tmp-db';
import { CarpetMessageRepository } from '../../src/main/db/repos/carpet-messages.repo';
import type { Db } from '../../src/main/db/database';

describe('CarpetMessageRepository — jurnal propriu în SQLite real', () => {
  let db: Db;
  let cleanup: () => void;
  let repo: CarpetMessageRepository;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    repo = new CarpetMessageRepository(db);
  });
  afterEach(() => cleanup());

  function client(nume = "Ștefan O'Brien", telefon: string | null = null): number {
    return Number(db.run('INSERT INTO carpet_clients (name, phone) VALUES (?, ?)', nume, telefon).lastInsertRowid);
  }

  it('baza goală păstrează metadatele paginii cerute, fără rânduri fictive', () => {
    expect(repo.list({ page: 2, pageSize: 3 })).toEqual({ items: [], total: 0, page: 2, pageSize: 3 });
  });

  it('persistă destinatarul real al mesajului, nu telefonul curent al clientului, și starea prepared', () => {
    const id = client("Ștefan O'Brien", '0700000000');
    repo.insertLog({ client_id: id, recipient: '+40712345678', message_preview: 'Covoarele sunt gata, mulțumim!' });
    db.run('UPDATE carpet_clients SET phone = ? WHERE id = ?', '0799999999', id);
    const pagina = new CarpetMessageRepository(db).list({ page: 1, pageSize: 10 });
    expect(pagina).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]).toMatchObject({
      client_id: id, client_name: "Ștefan O'Brien", recipient: '+40712345678',
      channel: 'whatsapp', status: 'prepared', message_preview: 'Covoarele sunt gata, mulțumim!',
    });
    expect(pagina.items[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('apostroful, markup-ul și 5000 de caractere sunt date, nu SQL executabil sau text trunchiat', () => {
    const nume = "O'Brien'); DROP TABLE carpet_clients; -- <script>ăâîșț</script>";
    const id = client(nume);
    const mesaj = "ăâîșț O'Brien <script>&</script> ".repeat(200).slice(0, 5000);
    expect(mesaj).toHaveLength(5000);
    repo.insertLog({ client_id: id, recipient: "+40'712345678", message_preview: mesaj });
    expect(repo.list({ page: 1, pageSize: 1 }).items[0]).toMatchObject({
      client_name: nume, recipient: "+40'712345678", message_preview: mesaj,
    });
    expect(db.get('SELECT COUNT(*) AS n FROM carpet_clients')).toEqual({ n: 1 });
    expect(db.get('SELECT COUNT(*) AS n FROM message_logs')).toEqual({ n: 0 });
    expect(db.get('SELECT COUNT(*) AS n FROM tyre_message_log')).toEqual({ n: 0 });
  });

  it('ordonează întâi după dată, apoi după id la aceeași secundă; pagina a doua nu repetă prima', () => {
    const id = client();
    for (const [mesaj, data] of [
      ['recent, id mic', '2026-09-10 08:00:00'],
      ['vechi, id mare', '2026-09-09 23:59:59'],
      ['recent, id mare', '2026-09-10 08:00:00'],
    ]) {
      repo.insertLog({ client_id: id, recipient: '+40712345678', message_preview: mesaj });
      db.run('UPDATE carpet_message_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM carpet_message_logs)', data);
    }
    const prima = repo.list({ page: 1, pageSize: 2 });
    const aDoua = repo.list({ page: 2, pageSize: 2 });
    expect(prima.items.map((m) => m.message_preview)).toEqual(['recent, id mare', 'recent, id mic']);
    expect(aDoua.items.map((m) => m.message_preview)).toEqual(['vechi, id mare']);
    expect(prima.total).toBe(3);
    expect(aDoua).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(repo.list({ page: 3, pageSize: 2 })).toEqual({ items: [], total: 3, page: 3, pageSize: 2 });
  });

  it('include și un client vechi fără nume sau telefon, fără să piardă mesajul', () => {
    // Numele gol este posibil în date importate; NULL este interzis de schema SQLite.
    const id = client('');
    repo.insertLog({ client_id: id, recipient: 'destinatar istoric', message_preview: 'Mesaj păstrat' });
    expect(repo.list({ page: 1, pageSize: 10 }).items).toEqual([
      expect.objectContaining({ client_id: id, client_name: '', recipient: 'destinatar istoric', message_preview: 'Mesaj păstrat' }),
    ]);
  });

  it('un client inexistent încalcă FK și nu lasă un mesaj orfan sau alte inserări parțiale', () => {
    expect(() => repo.insertLog({ client_id: 99999, recipient: '0712345678', message_preview: 'Nu trebuie salvat' }))
      .toThrow(/FOREIGN KEY constraint failed/);
    expect(repo.list({ page: 1, pageSize: 10 }).total).toBe(0);
  });
});
