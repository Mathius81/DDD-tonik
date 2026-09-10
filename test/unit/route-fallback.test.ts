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
import { matchRoutes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const captura = vi.hoisted(() => ({ routes: [] as import('react-router-dom').RouteObject[] }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    // Capturăm configurația REALĂ a aplicației, fără istoric DOM în testele Node.
    createHashRouter: (routes: import('react-router-dom').RouteObject[]) => { captura.routes = routes; return {}; },
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => createElement('a', { href: to, 'data-replace': String(!!replace) }),
  };
});
vi.mock('../../src/renderer/api/ddd', () => ({ ddd: {} }));

import { getInitialRoute } from '../../src/renderer/workspace';

describe('Fallback pentru rute dispărute — configurația reală din App', () => {
  let stocare: Map<string, string>;
  beforeAll(async () => { await import('../../src/renderer/App'); });
  beforeEach(() => {
    stocare = new Map();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => stocare.get(key) ?? null } });
  });
  afterEach(() => vi.unstubAllGlobals());

  function redirectRandat(cale: string): string {
    const potriviri = matchRoutes(captura.routes, cale)!;
    expect(potriviri).not.toBeNull();
    return renderToStaticMarkup(potriviri.at(-1)!.route.element);
  }

  it.each(['ddd', 'covoare', 'cauciucuri'])('REGRESIE P3: ruta dispărută memorată în %s revine la dashboard, nu la ea însăși', (spatiu) => {
    const disparuta = `/${spatiu}/pagina-disparuta`;
    stocare.set('tonik.workspace.active', spatiu);
    stocare.set(`tonik.workspace.lastPath.${spatiu}`, disparuta);
    // Prima redirecționare poate folosi istoricul; a doua TREBUIE să iasă din buclă.
    expect(getInitialRoute()).toBe(disparuta);
    expect(redirectRandat('/')).toContain(`href="${disparuta}"`);
    const fallback = redirectRandat(disparuta);
    expect(fallback).toContain(`href="/${spatiu}"`);
    expect(fallback).toContain('data-replace="true"');
    expect(fallback).not.toContain(disparuta);
  });

  it('păstrează pornirea pe o pagină validă, inclusiv un detaliu de asociație cu parametri', () => {
    stocare.set('tonik.workspace.active', 'ddd');
    stocare.set('tonik.workspace.lastPath.ddd', '/ddd/asociatii/42?tab=contacte');
    expect(getInitialRoute()).toBe('/ddd/asociatii/42?tab=contacte');
    expect(redirectRandat('/')).toContain('href="/ddd/asociatii/42?tab=contacte"');
  });

  it('istoricul cu spațiu invalid sau localStorage inaccesibil revine sigur la DDD', () => {
    stocare.set('tonik.workspace.active', 'spatiu-disparut');
    expect(redirectRandat('/cale-necunoscuta')).toContain('href="/ddd"');
    vi.stubGlobal('window', { get localStorage() { throw new Error('Indisponibil'); } });
    expect(redirectRandat('/cale-necunoscuta')).toContain('href="/ddd"');
  });
});
