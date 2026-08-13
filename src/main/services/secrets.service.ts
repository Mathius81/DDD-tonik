import { safeStorage } from 'electron';
import type { SettingsRepository } from '../db/repos/settings.repo';

const SECRET_PREFIX = 'secret_';

/**
 * Stochează secrete (parola SMTP, token WhatsApp) criptate cu safeStorage.
 * Valorile criptate stau în tabela settings sub chei `secret_*`.
 * Secretele NU sunt trimise niciodată către renderer.
 */
export class SecretsService {
  constructor(private settings: SettingsRepository) {}

  set(key: 'smtp_password' | 'whatsapp_access_token', value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Criptarea locală nu este disponibilă pe acest sistem.');
    }
    const encrypted = safeStorage.encryptString(value);
    this.settings.setRaw(`${SECRET_PREFIX}${key}`, encrypted.toString('base64'));
  }

  get(key: 'smtp_password' | 'whatsapp_access_token'): string | null {
    const stored = this.settings.getRaw(`${SECRET_PREFIX}${key}`);
    if (!stored) return null;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return null;
    }
  }

  delete(key: 'smtp_password' | 'whatsapp_access_token'): void {
    this.settings.deleteRaw(`${SECRET_PREFIX}${key}`);
  }
}
