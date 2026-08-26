/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { Logger } from '../../logger';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

/**
 * Codul de eroare Meta pentru „re-engagement message": fereastra de 24h de conversație
 * s-a închis și textul liber nu mai poate fi trimis — trebuie folosit un template aprobat.
 */
export const WHATSAPP_REENGAGEMENT_ERROR_CODE = 131047;

/**
 * Mesaj afișat/logat când provider-ul e în DRY-RUN (lipsește tokenul sau Phone Number
 * ID) și `allowDryRun` nu e activat — cazul din producție, unde NU simulăm succes.
 */
export const WHATSAPP_DRY_RUN_ERROR_MESSAGE =
  'WhatsApp automat este configurat incomplet — lipsește tokenul de acces sau Phone Number ID. ' +
  'Verifică Setări → WhatsApp.';

export interface WhatsappCloudConfig {
  phoneNumberId: string;
  /** null dacă tokenul nu a fost încă salvat — provider-ul intră automat în DRY-RUN. */
  accessToken: string | null;
}

export interface WhatsappSendResult {
  ok: boolean;
  /** ID-ul mesajului WhatsApp (wamid) la succes; prefixat 'dryrun-' în modul de probă. */
  wamid?: string;
  error?: string;
  errorCode?: number;
  errorSubcode?: number;
  /** true dacă eroarea era temporară (429/5xx) și s-au epuizat reîncercările. */
  retryable?: boolean;
}

export interface WhatsappVerifyResult {
  ok: boolean;
  displayPhoneNumber?: string;
  verifiedName?: string;
  error?: string;
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

type MinimalLogger = Pick<Logger, 'info' | 'warn' | 'error'>;

/**
 * Client pentru WhatsApp Business Cloud API (Meta Graph API) — modul „automat" (spec),
 * alături de modul asistat existent (wa.me).
 *
 * Fără access token SAU phone_number_id configurate, provider-ul e în DRY-RUN. Implicit
 * (`allowDryRun = false`, calea de producție) NU simulăm succes: un mesaj care n-a plecat
 * nicăieri nu trebuie raportat ca „Trimis" (spec: fără DRY-RUN tăcut). `allowDryRun: true`
 * păstrează comportamentul vechi — loghează payload-ul JSON complet și întoarce un
 * rezultat simulat — util doar pentru testarea fluxului în dezvoltare, fără cont Meta activ.
 */
export class WhatsappCloudProvider {
  constructor(
    private config: WhatsappCloudConfig,
    private logger: MinimalLogger,
    private retryBaseDelayMs: number = DEFAULT_RETRY_BASE_DELAY_MS,
    private allowDryRun: boolean = false,
  ) {}

  private get dryRun(): boolean {
    return !this.config.accessToken || !this.config.phoneNumberId;
  }

  /** True dacă lipsesc tokenul sau Phone Number ID — provider-ul nu poate trimite real. */
  isDryRun(): boolean {
    return this.dryRun;
  }

  /** Trimite mesaj cu text liber — valid doar în fereastra de 24h de conversație activă. */
  async sendText(to: string, body: string): Promise<WhatsappSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  /**
   * Trimite un template aprobat de Meta, cu parametri poziționali pentru {{1}}, {{2}}...
   * din corpul template-ului. Funcționează oricând, indiferent de fereastra de 24h.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    language: string,
    params: string[],
  ): Promise<WhatsappSendResult> {
    return this.send({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || 'ro' },
        ...(params.length > 0
          ? {
              components: [
                {
                  type: 'body',
                  parameters: params.map((text) => ({ type: 'text', text })),
                },
              ],
            }
          : {}),
      },
    });
  }

  /** Verifică token + phone_number_id printr-un GET simplu („Testează conexiunea" din Setări). */
  async verify(): Promise<WhatsappVerifyResult> {
    if (this.dryRun) {
      return {
        ok: false,
        error: 'Configurează Phone Number ID și Access Token înainte de a testa conexiunea.',
      };
    }
    try {
      const res = await fetch(
        `${GRAPH_BASE_URL}/${encodeURIComponent(this.config.phoneNumberId)}?fields=verified_name,display_phone_number`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.config.accessToken}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const json = (await res.json().catch(() => ({}))) as MetaErrorBody & {
        verified_name?: string;
        display_phone_number?: string;
      };
      if (!res.ok) {
        return { ok: false, error: this.describeError(json, res.status) };
      }
      return {
        ok: true,
        displayPhoneNumber: json.display_phone_number,
        verifiedName: json.verified_name,
      };
    } catch (err) {
      return { ok: false, error: this.describeNetworkError(err) };
    }
  }

  private async send(payload: Record<string, unknown>): Promise<WhatsappSendResult> {
    if (this.dryRun) {
      if (!this.allowDryRun) {
        // Calea de producție: NU simulăm succes pentru un mesaj care n-a plecat
        // nicăieri — apelantul (MessagingService) trebuie să-l trateze ca eșec real.
        return { ok: false, error: WHATSAPP_DRY_RUN_ERROR_MESSAGE };
      }
      this.logger.info(
        `WhatsApp Cloud API — DRY-RUN (lipsește tokenul sau Phone Number ID; niciun request nu a fost trimis). ` +
          `Payload care s-ar fi trimis:\n${JSON.stringify(payload, null, 2)}`,
      );
      return { ok: true, wamid: `dryrun-${Date.now()}-${Math.round(Math.random() * 1e6)}` };
    }

    let lastError: WhatsappSendResult = { ok: false, error: 'Eroare necunoscută la trimiterea WhatsApp.' };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(
          `${GRAPH_BASE_URL}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );

        const json = (await res.json().catch(() => ({}))) as MetaErrorBody & {
          messages?: Array<{ id?: string }>;
        };

        if (res.ok) {
          return { ok: true, wamid: json.messages?.[0]?.id };
        }

        // Reîncercăm intern DOAR pe 429 (rate limit) — Meta garantat nu a procesat
        // requestul. 5xx și erorile de rețea/timeout devin eșec imediat (retryable:true,
        // dar fără buclă internă): endpoint-ul /messages nu are cheie de idempotență, iar
        // reîncercarea internă compusă cu cea a scheduler-ului putea trimite același
        // mesaj de mai multe ori dacă Meta a acceptat requestul dar răspunsul s-a pierdut.
        const rateLimited = res.status === 429;
        lastError = {
          ok: false,
          error: this.describeError(json, res.status),
          errorCode: json.error?.code,
          errorSubcode: json.error?.error_subcode,
          retryable: rateLimited || res.status >= 500,
        };

        if (!rateLimited || attempt === MAX_ATTEMPTS) {
          return lastError;
        }

        const backoffMs = this.retryBaseDelayMs * 2 ** (attempt - 1);
        this.logger.warn(
          `WhatsApp Cloud API: încercarea ${attempt}/${MAX_ATTEMPTS} a eșuat (HTTP 429 — rate limit), reîncerc peste ${backoffMs}ms — ${lastError.error}`,
        );
        await this.delay(backoffMs);
      } catch (err) {
        // Eroare de rețea/timeout — nu știm dacă Meta a apucat să proceseze requestul,
        // deci NU reîncercăm intern; eșec imediat, retryable:true pentru scheduler.
        return { ok: false, error: this.describeNetworkError(err), retryable: true };
      }
    }
    return lastError;
  }

  private describeError(body: MetaErrorBody, status: number): string {
    const err = body.error;
    if (err?.code === WHATSAPP_REENGAGEMENT_ERROR_CODE) {
      return 'Fereastra de 24h de conversație s-a închis — Meta acceptă doar mesaje-template aprobate în afara ei.';
    }
    if (err?.message) {
      return `Meta a refuzat mesajul (cod ${err.code ?? status}): ${err.message}`;
    }
    return `Meta a răspuns cu eroarea HTTP ${status}.`;
  }

  private describeNetworkError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
