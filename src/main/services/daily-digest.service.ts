/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { shell } from 'electron';
import type { AppContext } from '../app-context';
import type { MessagingService } from './messaging/messaging.service';
import type { NotificationService } from './notification.service';
import { renderEmailHtml, textToHtml, logoAttachment } from './messaging/email-template';
import { normalizePhoneE164 } from './messaging/template-render';
import { reportIds, type DailyReportSettings, type ReportId, type Settings } from '../../shared/schemas/settings';
import type { Contact } from '../../shared/schemas/contact';
import { buildReportContent, type ReportContent } from './reports/report-builder';

/** Cheia veche (un singur raport global) — păstrată doar pentru „puntea” de compatibilitate. */
const LAST_DIGEST_KEY = 'last_daily_digest_date';

export interface ChannelResult {
  channel: 'email' | 'whatsapp' | 'notification';
  ok: boolean;
  error?: string;
}

export interface RunReportResult {
  /** false dacă raportul n-a fost măcar încercat (dezactivat, oră netrecută sau deja trimis azi). */
  attempted: boolean;
  /** true dacă cel puțin un canal a reușit. */
  sent: boolean;
  /** true dacă raportul n-a avut niciun conținut de trimis (și a fost sărit intenționat). */
  empty: boolean;
  failures: ChannelResult[];
}

/**
 * Rapoartele zilnice „planul zilei” — 6 rapoarte independente (DDD/Covoare/Cauciucuri ×
 * dimineața/seara), fiecare cu propriul orar, propriile canale (email/WhatsApp/notificare
 * desktop) și propriul marcaj „trimis azi”, ca să nu se blocheze reciproc.
 *
 * Rulează din scheduler: la ora setată a fiecărui raport, sau la prima pornire de după ea
 * (catch-up dacă PC-ul a fost oprit la ora programată).
 */
export class DailyDigestService {
  constructor(
    private ctx: AppContext,
    private messaging: MessagingService,
    private notifications: NotificationService,
  ) {}

  /** Apelat la fiecare tick al scheduler-ului — încearcă toate cele 6 rapoarte. */
  async tick(): Promise<void> {
    for (const id of reportIds) {
      try {
        await this.runReport(id, { force: false });
      } catch (err) {
        // Un raport eșuat nu trebuie să blocheze celelalte 5.
        this.ctx.logger.error(`Raportul ${id} a eșuat la tick`, err);
      }
    }
  }

  /** Trimite acum raportul cerut, forțat (folosit de butonul „Trimite acum, de probă”). */
  async sendNow(id: ReportId): Promise<RunReportResult> {
    return this.runReport(id, { force: true });
  }

  private sentKey(id: ReportId): string {
    return `${LAST_DIGEST_KEY}::${id}`;
  }

  private markSentToday(id: ReportId, todayIso: string): void {
    this.ctx.settings.setRaw(this.sentKey(id), todayIso);
  }

  /**
   * Punte de compatibilitate, o singură dată: dacă marcajul nou per-raport pentru
   * „ddd_dimineata” nu există încă, dar cel vechi (global) arată că s-a trimis deja azi,
   * copiem valoarea — altfel raportul de dimineață DDD s-ar putea retrimite chiar în ziua
   * actualizării aplicației, deși fusese deja trimis azi sub sistemul vechi.
   */
  private bridgeLegacyKey(id: ReportId, todayIso: string): void {
    if (id !== 'ddd_dimineata') return;
    const newKey = this.sentKey(id);
    if (this.ctx.settings.getRaw(newKey) !== undefined) return;
    const legacy = this.ctx.settings.getRaw(LAST_DIGEST_KEY);
    if (legacy === todayIso) {
      this.ctx.settings.setRaw(newKey, legacy);
    }
  }

  private async runReport(id: ReportId, opts: { force: boolean }): Promise<RunReportResult> {
    const settings = this.ctx.settings.get();
    const report = settings.daily_digest.reports[id];
    const todayIso = this.ctx.todayIso();

    if (!opts.force) {
      if (!report.enabled) return { attempted: false, sent: false, empty: false, failures: [] };

      const now = this.ctx.now();
      const [hh, mm] = report.send_at.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) {
        return { attempted: false, sent: false, empty: false, failures: [] };
      }

      this.bridgeLegacyKey(id, todayIso);
      if (this.ctx.settings.getRaw(this.sentKey(id)) === todayIso) {
        return { attempted: false, sent: false, empty: false, failures: [] };
      }
    }

    const content = buildReportContent(this.ctx, id);
    // Raportul de dimineață DDD păstrează comportamentul vechi exact: se trimite mereu,
    // chiar și „gol” (cu mesajul de rezervă „Nimic urgent astăzi”). Toate celelalte 5
    // rapoarte, fiind noi, respectă regula generală: fără conținut → nu trimitem nimic.
    const mustAlwaysSend = id === 'ddd_dimineata';
    if (content.isEmpty && !mustAlwaysSend) {
      if (!opts.force) this.markSentToday(id, todayIso);
      return { attempted: true, sent: false, empty: true, failures: [] };
    }

    const results: ChannelResult[] = [];
    if (report.channels.email) results.push(await this.sendEmailChannel(report, content, settings));
    if (report.channels.whatsapp) results.push(await this.sendWhatsappChannel(settings, content));
    if (report.channels.notification) results.push(this.sendNotificationChannel(content));

    const anySuccess = results.some((r) => r.ok);
    // Marcăm ziua ca „trimisă” dacă a reușit măcar un canal; dacă niciunul dintre canalele
    // ACTIVATE n-a reușit (ex. SMTP jos), reîncercăm la fiecare tick, ca la raportul vechi.
    // Dacă raportul e activat dar fără niciun canal bifat, marcăm oricum (nimic de reîncercat).
    if (!opts.force && (results.length === 0 || anySuccess)) {
      this.markSentToday(id, todayIso);
    }

    return { attempted: true, sent: anySuccess, empty: false, failures: results.filter((r) => !r.ok) };
  }

  private async sendEmailChannel(
    report: DailyReportSettings,
    content: ReportContent,
    settings: Settings,
  ): Promise<ChannelResult> {
    const active = report.recipients.filter((r) => r.active && r.email);
    if (active.length === 0) {
      return { channel: 'email', ok: false, error: 'Niciun destinatar activ pe email' };
    }
    if (!settings.smtp.host) {
      return { channel: 'email', ok: false, error: 'SMTP neconfigurat (Setări → Email)' };
    }

    const html = renderEmailHtml(textToHtml(content.body), settings.company);
    let anyOk = false;
    const errors: string[] = [];
    for (const r of active) {
      try {
        const result = await this.messaging.emailProvider().send({
          to: r.email,
          subject: content.subject,
          body: content.body,
          html,
          attachments: [logoAttachment()],
        });
        if (result.ok) {
          anyOk = true;
          this.ctx.logger.info(`${content.title} trimis pe email către ${r.email}`);
        } else {
          errors.push(`${r.email}: ${result.error ?? 'eroare SMTP'}`);
          this.ctx.logger.error(`${content.title} către ${r.email} a eșuat: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${r.email}: ${msg}`);
        this.ctx.logger.error(`${content.title} către ${r.email} a eșuat`, err);
      }
    }
    return { channel: 'email', ok: anyOk, error: anyOk ? undefined : errors.join('; ') };
  }

  private async sendWhatsappChannel(settings: Settings, content: ReportContent): Promise<ChannelResult> {
    const rawPhone = settings.daily_digest.owner_whatsapp_phone.trim();
    if (!rawPhone) {
      return { channel: 'whatsapp', ok: false, error: 'Fără număr de WhatsApp propriu configurat' };
    }
    if (settings.whatsapp.mode === 'disabled') {
      return { channel: 'whatsapp', ok: false, error: 'WhatsApp dezactivat (Setări → WhatsApp)' };
    }
    const phone = normalizePhoneE164(rawPhone);
    if (!phone) {
      return { channel: 'whatsapp', ok: false, error: 'Numărul de WhatsApp propriu nu pare valid' };
    }

    if (settings.whatsapp.mode === 'assisted') {
      // Mod asistat: NU deschidem automat fereastra WhatsApp la trimitere (ar fi intruziv
      // și poate fi ratat) — arătăm o notificare desktop; la click se deschide conversația.
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(content.body)}`;
      this.notifications.showWithClick(
        `Tonik · ${content.title} pe WhatsApp`,
        `${content.summary} Apasă pentru a deschide conversația cu raportul pregătit.`,
        () => {
          shell.openExternal(waUrl).catch((err) => {
            this.ctx.logger.error('Deschiderea conversației WhatsApp a eșuat', err);
          });
        },
      );
      return { channel: 'whatsapp', ok: true };
    }

    // Mod „cloud_api”: trimitem automat, ca text liber, către propriul număr.
    // Nu există un rând `contacts` real pentru „proprietar” — construim unul sintetic,
    // nepersistat; e sigur pentru că singurul cod care-i citește câmpurile
    // (fallback-ul pe template la eroarea 131047) se oprește imediat fără mapare de
    // template, ceea ce e mereu cazul pentru rapoarte (templateUsedId = null).
    const ownerContact: Contact = {
      id: 0,
      association_id: 0,
      name: 'Proprietar',
      role: 'Altul',
      phone,
      email: null,
      preferred_channel: 'whatsapp',
      is_primary: false,
      allow_whatsapp: true,
      allow_email: false,
      allow_sms: false,
      do_not_contact: false,
      notes: null,
      created_at: '',
      updated_at: '',
    };
    const result = await this.messaging.sendWhatsappCloudApiAuto(
      ownerContact,
      phone,
      content.body,
      null,
      null,
    );
    if (!result.ok) {
      this.ctx.logger.error(`${content.title} pe WhatsApp a eșuat: ${result.error}`);
    }
    return { channel: 'whatsapp', ok: result.ok, error: result.error };
  }

  private sendNotificationChannel(content: ReportContent): ChannelResult {
    this.notifications.show(`Tonik · ${content.title}`, content.summary, content.route);
    return { channel: 'notification', ok: true };
  }
}
