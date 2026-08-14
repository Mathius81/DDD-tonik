import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync, sign, createPublicKey, verify } from 'node:crypto';
import { createTestDb } from '../helpers/tmp-db';
import type { Db } from '../../src/main/db/database';
import { SettingsRepository } from '../../src/main/db/repos/settings.repo';
import { LicenseService } from '../../src/main/services/license.service';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as never;

/**
 * LicenseService are cheia publică de producție hardcodată; pentru teste
 * generăm o pereche proprie și injectăm cheia publică printr-o subclasă mică.
 */
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const TEST_PUB_B64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makeToken(exp: string, tamper = false): string {
  const payload = Buffer.from(JSON.stringify({ exp }), 'utf8');
  const signature = sign(null, payload, privateKey);
  const payloadOut = tamper
    ? Buffer.from(JSON.stringify({ exp: '2099-12-31' }), 'utf8')
    : payload;
  return `TONIK-${b64url(payloadOut)}.${b64url(signature)}`;
}

// Subclasă de test care folosește cheia publică generată aici.
class TestLicenseService extends LicenseService {
  override parseToken(token: string): string | null {
    try {
      const m = token.trim().match(/^TONIK-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
      if (!m) return null;
      const payload = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const sig = Buffer.from(m[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const pub = createPublicKey({
        key: Buffer.from(TEST_PUB_B64, 'base64'),
        format: 'der',
        type: 'spki',
      });
      if (!verify(null, payload, pub, sig)) return null;
      const data = JSON.parse(payload.toString('utf8')) as { exp?: string };
      return data.exp && /^\d{4}-\d{2}-\d{2}$/.test(data.exp) ? data.exp : null;
    } catch {
      return null;
    }
  }
}

describe('LicenseService', () => {
  let db: Db;
  let cleanup: () => void;
  let settings: SettingsRepository;

  beforeEach(() => {
    const t = createTestDb();
    db = t.db;
    cleanup = t.cleanup;
    settings = new SettingsRepository(db);
  });

  afterEach(() => cleanup());

  const service = (nowIso: string) =>
    new TestLicenseService(settings, silentLogger, () => new Date(nowIso));

  it('fără cheie → missing', () => {
    expect(service('2026-08-14T10:00:00').check().status).toBe('missing');
  });

  it('cheie validă → valid, cu zile rămase și avertisment sub 7 zile', () => {
    const s = service('2026-08-14T10:00:00');
    s.activate(makeToken('2026-09-14'));
    const state = s.check();
    expect(state.status).toBe('valid');
    if (state.status === 'valid') {
      expect(state.daysLeft).toBe(31);
      expect(state.warning).toBe(false);
    }
    const near = service('2026-09-10T10:00:00').check();
    expect(near.status).toBe('valid');
    if (near.status === 'valid') expect(near.warning).toBe(true);
  });

  it('după data de expirare → expired (inclusiv ziua expirării merge)', () => {
    service('2026-08-14T10:00:00').activate(makeToken('2026-08-20'));
    // În ziua expirării încă merge (inclusiv) — verificat înainte să "vedem" 21 august.
    expect(service('2026-08-20T23:59:00').check().status).toBe('valid');
    expect(service('2026-08-21T00:01:00').check().status).toBe('expired');
  });

  it('cheie falsificată (payload modificat) → respinsă', () => {
    const s = service('2026-08-14T10:00:00');
    expect(() => s.activate(makeToken('2026-09-14', true))).toThrow();
  });

  it('cheie expirată nu poate fi activată', () => {
    const s = service('2026-08-14T10:00:00');
    expect(() => s.activate(makeToken('2026-01-01'))).toThrow(/expirată/);
  });

  it('ceasul dat înapoi nu resuscitează licența', () => {
    // Aplicația a văzut 21 august (expirată); utilizatorul dă ceasul înapoi.
    service('2026-08-14T10:00:00').activate(makeToken('2026-08-20'));
    expect(service('2026-08-21T10:00:00').check().status).toBe('expired');
    expect(service('2026-08-01T10:00:00').check().status).toBe('expired');
  });
});
