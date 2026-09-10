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
import { createTestDb } from '../helpers/tmp-db';
import { CarpetSettingsRepository } from '../../src/main/db/repos/carpet-settings.repo';
import type { Db } from '../../src/main/db/database';

const implicite = {
  default_price_per_sqm: null, default_due_days: null, notify_on_ready: true, revisit_months: null,
};

describe('CarpetSettingsRepository — persistență și valori opționale', () => {
  let db: Db;
  let cleanup: () => void;
  let repo: CarpetSettingsRepository;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    repo = new CarpetSettingsRepository(db);
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('rândul creat de migrație are opționale null și notificare booleană activă', () => {
    expect(repo.get()).toMatchObject(implicite);
    expect(db.get('SELECT id, notify_on_ready FROM carpet_settings')).toEqual({ id: 1, notify_on_ready: 1 });
  });

  it('salvează toate câmpurile și traduce false în 0; o instanță nouă recitește valorile efective', () => {
    db.run("UPDATE carpet_settings SET updated_at = '2000-01-01 00:00:00'");
    const actualizare = { default_price_per_sqm: 12.75, default_due_days: 7, notify_on_ready: false, revisit_months: 3 };
    expect(repo.update(actualizare)).toMatchObject(actualizare);
    expect(new CarpetSettingsRepository(db).get()).toMatchObject(actualizare);
    expect(db.get('SELECT default_price_per_sqm, default_due_days, notify_on_ready, revisit_months FROM carpet_settings')).toEqual({
      ...actualizare, notify_on_ready: 0,
    });
    expect(repo.get().updated_at).not.toBe('2000-01-01 00:00:00');
    expect(repo.get().updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(db.get('SELECT COUNT(*) AS n FROM carpet_settings')).toEqual({ n: 1 });
  });

  it('poate șterge valorile anterioare cu null și reactiva notificarea — nu păstrează accidental setările vechi', () => {
    repo.update({ default_price_per_sqm: 15, default_due_days: 5, notify_on_ready: false, revisit_months: 6 });
    expect(repo.update(implicite)).toMatchObject(implicite);
    expect(db.get('SELECT notify_on_ready FROM carpet_settings')).toEqual({ notify_on_ready: 1 });
  });

  it('prețul zero rămâne zero, distinct de prețul nespecificat null', () => {
    expect(repo.update({ ...implicite, default_price_per_sqm: 0, default_due_days: 1, revisit_months: 60 }))
      .toMatchObject({ default_price_per_sqm: 0, default_due_days: 1, revisit_months: 60 });
  });

  it('nu modifică setările generale sau mesajele celorlalte spații de lucru', () => {
    db.run("INSERT INTO settings (key, value) VALUES ('martor', ?)", "Ștefan O'Brien & fii");
    const inainte = db.all('SELECT * FROM settings ORDER BY key');
    repo.update({ ...implicite, default_price_per_sqm: 30 });
    expect(db.all('SELECT * FROM settings ORDER BY key')).toEqual(inainte);
    expect(db.get('SELECT COUNT(*) AS n FROM carpet_message_logs')).toEqual({ n: 0 });
  });

  it('rândul lipsă oferă un fallback complet cu ceas determinist, fără să arunce sau să scrie implicit', () => {
    db.run('DELETE FROM carpet_settings');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2028-02-29T22:05:00Z'));
    expect(repo.get()).toEqual({ ...implicite, updated_at: '2028-02-29T22:05:00.000Z' });
    expect(db.get('SELECT COUNT(*) AS n FROM carpet_settings')).toEqual({ n: 0 });
  });
});
