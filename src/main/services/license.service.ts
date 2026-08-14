import { createPublicKey, verify as edVerify } from 'node:crypto';
import type { SettingsRepository } from '../db/repos/settings.repo';
import type { Logger } from '../logger';

/**
 * Licență offline cu expirare.
 *
 * Cheia e un token `TONIK-<payload_b64url>.<semnătură_b64url>`, unde payload-ul
 * este JSON {exp: 'YYYY-MM-DD'} semnat ed25519 cu cheia PRIVATĂ a emitentului
 * (păstrată doar de Marius, în afara aplicației). Aplicația conține doar cheia
 * publică, deci nimeni nu poate fabrica sau modifica o cheie validă.
 *
 * Protecție la ceas dat înapoi: reținem cea mai recentă dată văzută; "azi"
 * folosit la verificare nu poate fi mai mic decât acest maxim.
 */

const LICENSE_KEY = 'license_token';
const MAX_SEEN_DATE_KEY = 'license_max_seen_date';
const GRACE_WARN_DAYS = 7;

// Cheia publică ed25519 (SPKI, base64). Perechea privată NU e în aplicație.
const LICENSE_PUBLIC_KEY_B64 =
  'MCowBQYDK2VwAyEAN0VNuMVAHvmTER6BXHjVMl9Ms72D/1qY8TIaQuc//pc=';

export type LicenseState =
  | { status: 'valid'; expiresAt: string; daysLeft: number; warning: boolean }
  | { status: 'expired'; expiresAt: string }
  | { status: 'missing' };

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export class LicenseService {
  constructor(
    private settings: SettingsRepository,
    private logger: Logger,
    private now: () => Date = () => new Date(),
  ) {}

  /** 'azi', protejat împotriva ceasului dat înapoi. */
  private effectiveToday(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = this.now();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const maxSeen = this.settings.getRaw(MAX_SEEN_DATE_KEY) ?? '';
    if (today > maxSeen) {
      this.settings.setRaw(MAX_SEEN_DATE_KEY, today);
      return today;
    }
    return maxSeen;
  }

  /** Validează un token și întoarce data de expirare, sau null dacă e invalid. */
  parseToken(token: string): string | null {
    try {
      // Separatorul dintre payload și semnătură e '.', care nu apare în base64url.
      const m = token.trim().match(/^TONIK-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
      if (!m) return null;
      const payload = b64urlDecode(m[1]);
      const signature = b64urlDecode(m[2]);
      const publicKey = createPublicKey({
        key: Buffer.from(LICENSE_PUBLIC_KEY_B64, 'base64'),
        format: 'der',
        type: 'spki',
      });
      if (!edVerify(null, payload, publicKey, signature)) return null;
      const data = JSON.parse(payload.toString('utf8')) as { exp?: string };
      if (!data.exp || !/^\d{4}-\d{2}-\d{2}$/.test(data.exp)) return null;
      return data.exp;
    } catch {
      return null;
    }
  }

  /** Starea curentă a licenței. */
  check(): LicenseState {
    const token = this.settings.getRaw(LICENSE_KEY);
    if (!token) return { status: 'missing' };
    const exp = this.parseToken(token);
    if (!exp) return { status: 'missing' };

    const today = this.effectiveToday();
    if (today > exp) return { status: 'expired', expiresAt: exp };

    const daysLeft = Math.round(
      (Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    );
    return { status: 'valid', expiresAt: exp, daysLeft, warning: daysLeft <= GRACE_WARN_DAYS };
  }

  /** Activează o cheie nouă. Aruncă dacă e invalidă sau deja expirată. */
  activate(token: string): LicenseState {
    const exp = this.parseToken(token);
    if (!exp) throw new Error('Cheia introdusă nu este validă.');
    if (this.effectiveToday() > exp) throw new Error('Cheia introdusă este deja expirată.');
    this.settings.setRaw(LICENSE_KEY, token.trim());
    this.logger.info(`Licență activată, valabilă până la ${exp}`);
    return this.check();
  }
}
