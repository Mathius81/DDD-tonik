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
import { creeazaContextTest } from '../helpers/app-context';
import { creeazaMasina, depuneSet, inregistreazaSchimb } from '../helpers/tyre-fixtures';

describe('TyreSeasonReminderRepository — eligibilitate distinctă de garda anti-spam', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  beforeEach(() => { baza = creeazaContextTest(); });
  afterEach(() => { baza.cleanup(); vi.restoreAllMocks(); });

  it.each(['vara', 'iarna'] as const)('baza goală nu inventează clienți eligibili pentru %s', (sezon) => {
    expect(baza.ctx.tyreSeasonReminders.listEligibleClients(sezon)).toEqual([]);
  });

  it.each(['vara', 'iarna'] as const)('pentru %s selectează numai seturile sezonului cerut care sunt încă în depozit', (sezon) => {
    const { ctx } = baza;
    const opus = sezon === 'vara' ? 'iarna' : 'vara';
    const eligibil = creeazaMasina(ctx, "Ștefan O'Brien & fii", '0712345678');
    const altSezon = creeazaMasina(ctx, 'Doar sezonul opus');
    const ridicat = creeazaMasina(ctx, 'Set deja ridicat');
    depuneSet(ctx, eligibil.id, sezon);
    depuneSet(ctx, altSezon.id, opus);
    const set = depuneSet(ctx, ridicat.id, sezon);
    ctx.tyreStorage.pickup(set.id, '2026-08-15');
    expect(ctx.tyreSeasonReminders.listEligibleClients(sezon)).toEqual([{
      client_id: eligibil.client_id, client_name: "Ștefan O'Brien & fii", client_phone: '0712345678', season: sezon, reason: 'storage',
    }]);
  });

  it('un singur client cu două mașini, mai multe seturi și schimb opus apare o dată, cu motivul storage', () => {
    const { ctx } = baza;
    const prima = creeazaMasina(ctx, 'Țâncu Învățătoru');
    const aDoua = creeazaMasina(ctx, 'Nume nefolosit', null, prima.client_id);
    inregistreazaSchimb(ctx, prima.id, 'vara', '2026-04-01');
    depuneSet(ctx, prima.id, 'iarna');
    depuneSet(ctx, prima.id, 'iarna');
    depuneSet(ctx, aDoua.id, 'iarna');
    expect(ctx.tyreSeasonReminders.listEligibleClients('iarna')).toEqual([{
      client_id: prima.client_id, client_name: 'Țâncu Învățătoru', client_phone: null, season: 'iarna', reason: 'storage',
    }]);
  });

  it('nu unește persoane distincte doar fiindcă au același nume și niciuna nu are telefon', () => {
    const { ctx } = baza;
    const prima = creeazaMasina(ctx, 'Ion Popescu');
    const aDoua = creeazaMasina(ctx, 'Ion Popescu');
    depuneSet(ctx, prima.id, 'iarna');
    depuneSet(ctx, aDoua.id, 'iarna');
    expect(ctx.tyreSeasonReminders.listEligibleClients('iarna').map((c) => c.client_id).sort()).toEqual(
      [prima.client_id, aDoua.client_id].sort(),
    );
  });

  it('istoricul ia ultimul schimb pentru fiecare mașină, nu orice schimb opus și nu maximul global', () => {
    const { ctx } = baza;
    const eligibil = creeazaMasina(ctx, 'Mai are vară montată');
    const schimbat = creeazaMasina(ctx, 'Are deja iarnă montată');
    inregistreazaSchimb(ctx, eligibil.id, 'iarna', '2025-10-01');
    inregistreazaSchimb(ctx, eligibil.id, 'vara', '2026-04-01');
    inregistreazaSchimb(ctx, schimbat.id, 'vara', '2026-04-02');
    inregistreazaSchimb(ctx, schimbat.id, 'iarna', '2026-10-02');
    expect(ctx.tyreSeasonReminders.listEligibleClients('iarna')).toEqual([{
      client_id: eligibil.client_id, client_name: 'Mai are vară montată', client_phone: null, season: 'iarna', reason: 'past_swap',
    }]);
  });

  it('o a doua mașină schimbată nu ascunde prima mașină a aceluiași client încă pe sezonul opus', () => {
    const { ctx } = baza;
    const prima = creeazaMasina(ctx, 'Client cu două mașini');
    const aDoua = creeazaMasina(ctx, 'Nefolosit', null, prima.client_id);
    inregistreazaSchimb(ctx, prima.id, 'vara', '2026-04-01');
    inregistreazaSchimb(ctx, aDoua.id, 'iarna', '2026-10-01');
    expect(ctx.tyreSeasonReminders.listEligibleClients('iarna')).toEqual([{
      client_id: prima.client_id, client_name: 'Client cu două mașini', client_phone: null, season: 'iarna', reason: 'past_swap',
    }]);
  });

  it('la două schimburi în aceeași zi, ultima înregistrare departajează istoricul', () => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Corectare în aceeași zi');
    inregistreazaSchimb(ctx, masina.id, 'vara', '2026-10-01');
    inregistreazaSchimb(ctx, masina.id, 'iarna', '2026-10-01');
    expect(ctx.tyreSeasonReminders.listEligibleClients('iarna')).toEqual([]);
    expect(ctx.tyreSeasonReminders.listEligibleClients('vara')).toEqual([
      expect.objectContaining({ client_id: masina.client_id, reason: 'past_swap', season: 'vara' }),
    ]);
  });

  // Data schimbului decide sezonul montat; id-ul departajează doar aceeași zi.
  it.each(['vara', 'iarna'] as const)('REGRESIE: inserarea retroactivă nu schimbă sezonul efectiv al ultimei lucrări (%s)', (sezon) => {
    const { ctx } = baza;
    const masina = creeazaMasina(ctx, 'Istoric introdus retroactiv');
    inregistreazaSchimb(ctx, masina.id, sezon, '2026-10-01');
    inregistreazaSchimb(ctx, masina.id, sezon === 'vara' ? 'iarna' : 'vara', '2026-04-01');
    expect(ctx.tyreSeasonReminders.listEligibleClients(sezon)).toEqual([]);
    expect(ctx.tyreSeasonReminders.listEligibleClients(sezon === 'vara' ? 'iarna' : 'vara')).toEqual([
      expect.objectContaining({ client_id: masina.client_id, reason: 'past_swap' }),
    ]);
  });
});
