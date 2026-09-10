/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { safeStorage } from 'electron';
import type { AppContext } from '../app-context';

const SECRET_PREFIX = 'secret_';

/**
 * Stochează secrete (parola SMTP, token WhatsApp) criptate cu safeStorage.
 * Valorile criptate stau în tabela settings sub chei `secret_*`.
 * Secretele NU sunt trimise niciodată către renderer.
 */
export class SecretsService {
  // Contextul își păstrează identitatea la recuperarea unei restaurări eșuate;
  // repository-ul de setări se poate schimba odată cu redeschiderea bazei.
  constructor(private ctx: Pick<AppContext, 'settings'>) {}

  set(key: 'smtp_password' | 'whatsapp_access_token', value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Criptarea locală nu este disponibilă pe acest sistem.');
    }
    const encrypted = safeStorage.encryptString(value);
    this.ctx.settings.setRaw(`${SECRET_PREFIX}${key}`, encrypted.toString('base64'));
  }

  get(key: 'smtp_password' | 'whatsapp_access_token'): string | null {
    const stored = this.ctx.settings.getRaw(`${SECRET_PREFIX}${key}`);
    if (!stored) return null;
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      return null;
    }
  }

  delete(key: 'smtp_password' | 'whatsapp_access_token'): void {
    this.ctx.settings.deleteRaw(`${SECRET_PREFIX}${key}`);
  }
}
