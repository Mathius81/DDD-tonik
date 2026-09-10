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

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>(),
  openExternal: vi.fn(async (_url: string) => {}),
}));
vi.mock('electron', () => ({
  shell: { openExternal: electron.openExternal },
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => electron.handlers.set(channel, handler) },
  safeStorage: { decryptString: (value: Buffer) => value.toString() },
}));

import { creeazaContextTest } from '../helpers/app-context';
import { seedBasics } from '../helpers/tmp-db';
import { MessagingService } from '../../src/main/services/messaging/messaging.service';
import { SecretsService } from '../../src/main/services/secrets.service';
import { SmtpEmailProvider } from '../../src/main/services/messaging/email.provider';
import { registerAdministratorHandlers } from '../../src/main/ipc/administrators.ipc';
import { registerCarpetHandlers } from '../../src/main/ipc/carpets.ipc';
import { IPC, type IpcResult } from '../../src/shared/ipc-contract';
import type { MessageLog } from '../../src/shared/schemas/message';

const mesajLung = `${'Situația asociației: intervenție efectuată, urmează programarea următoare.\n'.repeat(10)}\nUltima asociație, semnătura completă — Firma Test.`;

describe('REGRESIE P0 — corpul integral la trimitere și retrimitere', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  let mesagerie: MessagingService;
  let ids: ReturnType<typeof seedBasics>;

  beforeEach(() => {
    baza = creeazaContextTest();
    ids = seedBasics(baza.ctx.db);
    mesagerie = new MessagingService(baza.ctx, new SecretsService(baza.ctx));
    electron.handlers.clear();
    electron.openExternal.mockClear();
    expect(mesajLung.length).toBeGreaterThan(500);
  });
  afterEach(() => { baza.cleanup(); vi.restoreAllMocks(); });

  async function invoke<T>(channel: string, payload: unknown): Promise<T> {
    const raspuns = await electron.handlers.get(channel)!({}, payload) as IpcResult<T>;
    expect(raspuns.ok).toBe(true);
    if (!raspuns.ok) throw new Error(raspuns.error);
    return raspuns.data;
  }

  it.each(['WhatsApp asistat', 'WhatsApp Cloud', 'email asistat', 'email SMTP'] as const)(
    '%s păstrează și retrimite inclusiv finalul de după caracterul 500', async (cale) => {
      const { ctx } = baza;
      const setari = ctx.settings.get();
      ctx.settings.save({
        ...setari,
        whatsapp: { ...setari.whatsapp, mode: cale === 'WhatsApp Cloud' ? 'cloud_api' : 'assisted' },
        smtp: { ...setari.smtp, host: cale === 'email SMTP' ? 'smtp.invalid' : '' },
      });
      const smtp = vi.spyOn(SmtpEmailProvider.prototype, 'send').mockResolvedValue({ ok: false, error: 'Eroare simulată' });
      vi.spyOn(mesagerie, 'sendWhatsappCloudApiAuto').mockResolvedValue({ ok: false, error: 'Eroare simulată' });
      const rezultat = mesagerie.send({
        contact_id: ids.contactId, followup_id: null, reminder_id: null,
        channel: cale.startsWith('email') ? 'email' : 'whatsapp',
        template_id: null, body_override: mesajLung,
      });
      if (cale === 'email SMTP' || cale === 'WhatsApp Cloud') {
        await expect(rezultat).rejects.toThrow();
      } else {
        await rezultat;
      }
      const log = ctx.db.get<MessageLog>('SELECT * FROM message_logs ORDER BY id DESC LIMIT 1')!;
      expect(log.message_preview).toBe(mesajLung);
      // Editarea ulterioară a șabloanelor nu schimbă corpul mesajului original.
      ctx.db.run("UPDATE message_templates SET body = 'Șablon schimbat între timp'");
      electron.openExternal.mockClear();
      smtp.mockResolvedValue({ ok: true, providerMessageId: 'id-fictiv' });
      await mesagerie.resend(log.id);
      if (cale === 'email SMTP') {
        expect(smtp).toHaveBeenLastCalledWith(expect.objectContaining({ body: mesajLung }));
      } else {
        const url = new URL(electron.openExternal.mock.calls[0][0]);
        expect(url.searchParams.get(cale === 'email asistat' ? 'body' : 'text')).toBe(mesajLung);
      }
      expect(ctx.db.get('SELECT COUNT(*) AS n FROM message_logs')).toEqual({ n: 1 });
    },
  );

  it('situația agregată a trei asociații se retrimite integral, cu ultima asociație și semnătură', async () => {
    const { ctx } = baza;
    for (const nume of ['Asociația Bloc B8', 'Asociația Bloc Z9']) {
      const asociatie = Number(ctx.db.run('INSERT INTO associations (name, address) VALUES (?, ?)', nume, 'Adresă de test').lastInsertRowid);
      ctx.db.run("INSERT INTO contacts (association_id, name, phone) VALUES (?, 'Ion Popescu', '0712345678')", asociatie);
    }
    for (const asociatie of ctx.db.all<{ id: number }>('SELECT id FROM associations')) {
      for (const serviciu of ctx.db.all<{ id: number }>('SELECT id FROM services')) {
        ctx.db.run("INSERT INTO followups (association_id, service_id, due_date, status) VALUES (?, ?, '2026-09-10', 'pending')", asociatie.id, serviciu.id);
        ctx.db.run("INSERT INTO interventions (association_id, service_id, performed_date, interval_months) VALUES (?, ?, '2026-06-10', 3)", asociatie.id, serviciu.id);
      }
    }
    const setari = ctx.settings.get();
    ctx.settings.save({ ...setari, company: { ...setari.company, name: 'Firma Test SRL', phone: '0700000000' } });
    registerAdministratorHandlers(ctx);
    const { body } = await invoke<{ body: string }>(IPC.administrators.preview, { phone: '0712345678' });
    expect(body.length).toBeGreaterThan(500);
    await invoke(IPC.administrators.whatsapp.send, { phone: '0712345678', message: body });
    const log = ctx.db.get<MessageLog>('SELECT * FROM message_logs ORDER BY id DESC LIMIT 1')!;
    expect(log.message_preview).toBe(body);
    await mesagerie.resend(log.id);
    const url = new URL(electron.openExternal.mock.calls.at(-1)![0]);
    expect(url.searchParams.get('text')).toBe(body);
    expect(body).toContain('Asociația Bloc Z9');
    expect(body.endsWith('Firma Test SRL')).toBe(true);
  });

  it('Covoare salvează mesajul complet primit de handler, nu numai previzualizarea', async () => {
    const { ctx } = baza;
    const clientId = Number(ctx.db.run("INSERT INTO carpet_clients (name, phone) VALUES ('Client Test', '0712345678')").lastInsertRowid);
    registerCarpetHandlers(ctx);
    await invoke(IPC.carpets.whatsapp.send, { client_id: clientId, message: mesajLung });
    expect(ctx.db.get('SELECT message_preview FROM carpet_message_logs')).toEqual({ message_preview: mesajLung });
    expect(new URL(electron.openExternal.mock.calls[0][0]).searchParams.get('text')).toBe(mesajLung);
  });

  it('REGRESIE P2: retrimiterea unui mesaj agregat respectă „Nu contacta” și pe alt contact al grupului', async () => {
    const { ctx } = baza;
    const asociatie = Number(ctx.db.run("INSERT INTO associations (name, address) VALUES ('Bloc Z9', 'Adresă')").lastInsertRowid);
    ctx.db.run("INSERT INTO contacts (association_id, name, phone) VALUES (?, 'Ion Popescu', '+40 712 345 678')", asociatie);
    registerAdministratorHandlers(ctx);
    await invoke(IPC.administrators.whatsapp.send, { phone: '0712345678', message: mesajLung });
    const log = ctx.db.get<MessageLog>('SELECT * FROM message_logs')!;
    expect(log.contact_id).toBe(ids.contactId);
    ctx.db.run('UPDATE contacts SET do_not_contact = 1 WHERE association_id = ?', asociatie);
    electron.openExternal.mockClear();
    await expect(mesagerie.resend(log.id)).rejects.toThrow('Contactul este marcat „Nu contacta”.');
    expect(electron.openExternal).not.toHaveBeenCalled();
    expect(ctx.messages.getLog(log.id)?.status).toBe('prepared');
  });

  it.each(['', '   '])('nu retrimite un jurnal cu corp gol (%j), rămas dintr-o versiune veche', async (corp) => {
    const log = baza.ctx.messages.insertLog({
      association_id: ids.associationId, contact_id: ids.contactId,
      followup_id: null, reminder_id: null, channel: 'email', recipient: 'destinatar-fictiv',
      template_id: null, message_preview: corp, status: 'failed',
    });
    await expect(mesagerie.resend(log.id)).rejects.toThrow('Mesajul salvat este gol.');
    expect(electron.openExternal).not.toHaveBeenCalled();
  });

  it.each(['email', 'whatsapp'] as const)('nu retrimite un jurnal %s de 500 de caractere care poate fi deja trunchiat', async (canal) => {
    const log = baza.ctx.messages.insertLog({
      association_id: ids.associationId, contact_id: ids.contactId,
      followup_id: null, reminder_id: null, channel: canal, recipient: 'destinatar-fictiv',
      template_id: null, message_preview: mesajLung.slice(0, 500), status: 'failed',
    });
    const smtp = vi.spyOn(SmtpEmailProvider.prototype, 'send').mockResolvedValue({ ok: true });
    await expect(mesagerie.resend(log.id)).rejects.toThrow('Textul salvat poate fi trunchiat la 500 de caractere');
    expect(electron.openExternal).not.toHaveBeenCalled();
    expect(smtp).not.toHaveBeenCalled();
    expect(baza.ctx.messages.getLog(log.id)?.status).toBe('failed');
  });
});
