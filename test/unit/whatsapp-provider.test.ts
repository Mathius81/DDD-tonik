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
import {
  WhatsappCloudProvider,
  WHATSAPP_REENGAGEMENT_ERROR_CODE,
} from '../../src/main/services/messaging/whatsapp.provider';

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('WhatsappCloudProvider', () => {
  beforeEach(() => {
    silentLogger.info.mockClear();
    silentLogger.warn.mockClear();
    silentLogger.error.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('construiește payload-ul de text liber și trimite un POST corect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [{ id: 'wamid.ABC123' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider(
      { phoneNumberId: '1234567890', accessToken: 'TOKEN' },
      silentLogger,
    );
    const result = await provider.sendText('40712345678', 'Bună ziua!');

    expect(result).toEqual({ ok: true, wamid: 'wamid.ABC123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '40712345678',
      type: 'text',
      text: { body: 'Bună ziua!' },
    });
  });

  it('construiește payload-ul de template cu parametri poziționali', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [{ id: 'wamid.T1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '999', accessToken: 'TOKEN' }, silentLogger);
    const result = await provider.sendTemplate('40712345678', 'reminder_service', 'ro', [
      'Ion Popescu',
      'Dezinsecție',
      '13.11.2026',
    ]);

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '40712345678',
      type: 'template',
      template: {
        name: 'reminder_service',
        language: { code: 'ro' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Ion Popescu' },
              { type: 'text', text: 'Dezinsecție' },
              { type: 'text', text: '13.11.2026' },
            ],
          },
        ],
      },
    });
  });

  it('reîncearcă la 429 (rate limit) și reușește la a doua încercare', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'Rate limited', code: 4 } }))
      .mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: 'wamid.RETRY' }] }));
    vi.stubGlobal('fetch', fetchMock);

    // retryBaseDelayMs mic — testul nu trebuie să aștepte secunde întregi.
    const provider = new WhatsappCloudProvider({ phoneNumberId: '1', accessToken: 'T' }, silentLogger, 1);
    const result = await provider.sendText('40712345678', 'Test');

    expect(result.ok).toBe(true);
    expect(result.wamid).toBe('wamid.RETRY');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('NU reîncearcă intern la 500+ (eroare server) — eșec imediat, retryable pentru scheduler', async () => {
    // Reîncercarea internă pe 5xx se compunea cu retry-ul scheduler-ului (până la 9
    // POST-uri reale pentru un singur reminder); /messages nu are cheie de idempotență,
    // deci pe timeout/eroare server lăsăm retry-ul exclusiv pe seama scheduler-ului.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { error: { message: 'Service unavailable' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '1', accessToken: 'T' }, silentLogger, 1);
    const result = await provider.sendText('40712345678', 'Test');

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // fără reîncercare internă
  });

  it('NU reîncearcă intern pe eroare de rețea/timeout — eșec imediat, retryable pentru scheduler', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '1', accessToken: 'T' }, silentLogger, 1);
    const result = await provider.sendText('40712345678', 'Test');

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // fără reîncercare internă
  });

  it('NU reîncearcă pe eroare permanentă 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: 'Parametru invalid', code: 100 } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '1', accessToken: 'T' }, silentLogger, 1);
    const result = await provider.sendText('40712345678', 'Test');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('detectează eroarea 131047 (fereastra de 24h închisă), fără reîncercare', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: {
          message: 'Re-engagement message',
          code: WHATSAPP_REENGAGEMENT_ERROR_CODE,
          error_subcode: 2534022,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '1', accessToken: 'T' }, silentLogger, 1);
    const result = await provider.sendText('40712345678', 'Test');

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe(WHATSAPP_REENGAGEMENT_ERROR_CODE);
    expect(result.errorSubcode).toBe(2534022);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('modul DRY-RUN cu allowDryRun=true (dezvoltare): fără token, nu face niciun request și întoarce un wamid simulat', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider(
      { phoneNumberId: '123', accessToken: null },
      silentLogger,
      undefined,
      true,
    );
    const result = await provider.sendText('40712345678', 'Test dry-run');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.wamid).toMatch(/^dryrun-/);
    expect(silentLogger.info).toHaveBeenCalledWith(expect.stringContaining('DRY-RUN'));
  });

  it('modul DRY-RUN cu allowDryRun=true: fără phone_number_id, nu face niciun request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider(
      { phoneNumberId: '', accessToken: 'TOKEN' },
      silentLogger,
      undefined,
      true,
    );
    const result = await provider.sendTemplate('40712345678', 'reminder_service', 'ro', ['Ion']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.wamid).toMatch(/^dryrun-/);
  });

  it('implicit (allowDryRun=false, calea de producție): DRY-RUN NU raportează succes simulat', async () => {
    // Fără allowDryRun explicit, provider-ul nu trebuie să simuleze niciodată un succes —
    // un mesaj care n-a plecat nicăieri nu poate fi raportat ca „Trimis” (spec #1).
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new WhatsappCloudProvider({ phoneNumberId: '123', accessToken: null }, silentLogger);
    const result = await provider.sendText('40712345678', 'Test');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/configurat incomplet/i);
  });

  it('isDryRun() reflectă corect starea de configurare', () => {
    const incomplete = new WhatsappCloudProvider({ phoneNumberId: '', accessToken: null }, silentLogger);
    expect(incomplete.isDryRun()).toBe(true);

    const complete = new WhatsappCloudProvider({ phoneNumberId: '123', accessToken: 'T' }, silentLogger);
    expect(complete.isDryRun()).toBe(false);
  });
});
