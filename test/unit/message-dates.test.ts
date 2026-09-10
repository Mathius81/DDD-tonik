/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dateTest = vi.hoisted(() => ({ utc: '2026-09-10 21:30:00' }));
vi.mock('../../src/renderer/api/ddd', () => ({
  ddd: {
    messages: {
      log: () => ({ items: [{ id: 1, created_at: dateTest.utc, association_name: 'Bloc Test', contact_name: 'Contact Test', channel: 'whatsapp', recipient: '0712345678', status: 'prepared', message_preview: 'Mesaj de test' }], total: 1 }),
      counts: () => ({ all: 1, prepared: 1, failed: 0 }),
    },
    carpets: { messages: { list: () => ({ items: [{ id: 1, created_at: dateTest.utc, client_name: 'Client Test', channel: 'whatsapp', recipient: '0712345678', status: 'prepared', message_preview: 'Covoarele sunt gata.' }], total: 1 }) } },
  },
}));
vi.mock('../../src/renderer/api/useIpc', () => ({
  useIpcQuery: (query: () => unknown) => ({ data: query(), loading: false, reload: vi.fn() }),
  runMutation: vi.fn(),
  unwrap: vi.fn(),
}));

import { MesajePage } from '../../src/renderer/pages/mesaje/MesajePage';
import { MesajePage as CovoareMesajePage } from '../../src/renderer/pages/covoare/MesajePage';

describe('Jurnalele de mesaje randate afișează ora locală, nu textul UTC din SQLite', () => {
  beforeEach(() => vi.stubEnv('TZ', 'Europe/Bucharest'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['DDD', MesajePage],
    ['Covoare', CovoareMesajePage],
  ] as const)('REGRESIE P2: pagina Mesaje %s convertește data inclusiv după miezul nopții', (_spatiu, Pagina) => {
    const html = renderToStaticMarkup(createElement(MantineProvider, { env: 'test' }, createElement(MemoryRouter, {}, createElement(Pagina))));
    expect(html).toContain('11.09.2026 00:30');
    expect(html).not.toContain('10.09.2026 21:30');
  });
});
