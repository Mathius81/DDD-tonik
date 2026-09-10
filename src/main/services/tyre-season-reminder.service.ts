/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import type { AppContext } from '../app-context';
import type { MessagingService } from './messaging/messaging.service';
import type { NotificationService } from './notification.service';
import { normalizePhoneE164 } from './messaging/template-render';
import type { Contact } from '../../shared/schemas/contact';
import { pluralRo } from '../../shared/text';
import {
  defaultTyreSeasonReminderSettings,
  renderTyreSeasonReminderMessage,
  tyreSeasonKey,
  tyreSeasonLabels,
  tyreSeasonReminderSettingsSchema,
  type TyreSeason,
  type TyreSeasonReminderEligibleClient,
  type TyreSeasonReminderSettings,
  type TyreSeasonReminderStatus,
  type TyreSeasonWindow,
} from '../../shared/schemas/tyre';

const SETTINGS_KEY = 'tyre_season_reminder_settings';
/** O singură notificare desktop (mod asistat) pe zi per sezon — nu una la fiecare tick. */
const ASSISTED_NOTIFIED_KEY_PREFIX = 'tyre_season_reminder_notified';
/** Id-ul (în `settings`) al șablonului local „ancoră" pentru maparea Meta — vezi migrația 007. */
const TEMPLATE_ID_SETTINGS_KEY = 'tyre_season_reminder_whatsapp_template_id';
/**
 * Plafon de reîncercări AUTOMATE (mod cloud_api) per client, per fereastră de sezon.
 * Echilibru: destul de mare încât un eșec trecător (indisponibilitate temporară a API-ului
 * Meta) să nu piardă clientul — la un tick de scheduler la 10 minute, 3 încercări acoperă
 * ~20-30 de minute — dar destul de mic încât un număr invalid permanent să nu fie
 * reîncercat la fiecare tick, toată ziua/noaptea. Nu blochează trimiterea MANUALĂ (butonul
 * din pagina Remindere rămâne mereu disponibil, indiferent de câte încercări automate au eșuat).
 */
export const MAX_AUTO_SEND_ATTEMPTS = 3;

/**
 * Remindere automate de sezon pentru Cauciucuri: când începe fereastra de schimb (setată
 * în Setări → Cauciucuri), clienții eligibili primesc mesajul o singură dată per fereastră.
 *
 * Gardă anti-spam: `TyreMessageLogRepository.hasBeenNotified` (sursă `season_reminder`,
 * `season_key` egal cu cheia ferestrei curente — vezi `tyreSeasonKey`) — echivalentul lui
 * `last_daily_digest_date` din `daily-digest.service.ts`, dar per client, nu global. Cheia
 * de fereastră e stabilă la ajustări ale datelor din Setări (spre deosebire de o comparație
 * pe dată calendaristică), iar `created_at` se scrie explicit în ora LOCALĂ
 * (`ctx.nowLocalIso()`) — nu implicit UTC — ca timpul din „Istoric mesaje" să fie corect.
 *
 * Trimiterea efectivă:
 *  - mod `cloud_api`: trimite automat prin `MessagingService.sendWhatsappCloudApiAuto`;
 *  - mod `assisted`: NU deschide browserul singur pentru N destinatari — arată O SINGURĂ
 *    notificare desktop pe zi, cu navigare spre pagina Remindere la click, unde operatorul
 *    trimite fiecărui client în parte (buton „Trimite pe WhatsApp”, ca la restul modulului).
 *  - mod `disabled`: nu face nimic.
 */
export class TyreSeasonReminderService {
  constructor(private ctx: AppContext) {}

  getSettings(): TyreSeasonReminderSettings {
    const raw = this.ctx.settings.getRaw(SETTINGS_KEY);
    if (!raw) return defaultTyreSeasonReminderSettings;
    try {
      return tyreSeasonReminderSettingsSchema.parse(JSON.parse(raw));
    } catch {
      return defaultTyreSeasonReminderSettings;
    }
  }

  saveSettings(settings: TyreSeasonReminderSettings): TyreSeasonReminderSettings {
    const validated = tyreSeasonReminderSettingsSchema.parse(settings);
    this.ctx.settings.setRaw(SETTINGS_KEY, JSON.stringify(validated));
    return validated;
  }

  /** Sezonul a cărui fereastră e activă la data `today`, sau `null` dacă niciuna. */
  activeWindow(settings: TyreSeasonReminderSettings, today: Date): TyreSeason | null {
    if (!settings.enabled) return null;
    if (isInWindow(today, settings.windows.iarna)) return 'iarna';
    if (isInWindow(today, settings.windows.vara)) return 'vara';
    return null;
  }

  /**
   * Cheia stabilă a ferestrei curente pentru sezonul dat (ex. `iarna-2026`) — vezi
   * `tyreSeasonKey` din `shared/schemas/tyre.ts` pentru explicația completă. Publică:
   * folosită și de `tyres.ipc.ts` la trimiterea manuală, ca rândul din istoric să poarte
   * aceeași cheie ca reminder-ele automate (altfel o trimitere manuală „season_reminder"
   * n-ar satisface garda pentru trimiterile automate ulterioare din aceeași fereastră).
   */
  seasonKeyFor(season: TyreSeason, settings: TyreSeasonReminderSettings = this.getSettings()): string {
    return tyreSeasonKey(season, settings.windows[season], this.ctx.now());
  }

  /** Starea completă pentru pagina „Remindere”: setări, fereastra activă, clienți eligibili. */
  status(): TyreSeasonReminderStatus {
    const settings = this.getSettings();
    const season = this.activeWindow(settings, this.ctx.now());
    if (!season) return { settings, activeWindow: null, eligible: [] };

    const seasonKey = this.seasonKeyFor(season, settings);
    const eligible: TyreSeasonReminderEligibleClient[] = this.ctx.tyreSeasonReminders
      .listEligibleClients(season)
      .map((c) => ({
        ...c,
        already_sent: this.ctx.tyreMessageLog.hasBeenNotified(c.client_id, season, seasonKey),
        failed_attempts: this.ctx.tyreMessageLog.countFailedAttempts(c.client_id, season, seasonKey),
        last_error: this.ctx.tyreMessageLog.lastFailureMessage(c.client_id, season, seasonKey),
      }));

    return { settings, activeWindow: season, eligible };
  }

  /** Mesajul pregătit (cu {nume}/{sezon} înlocuite) pentru un client eligibil dat. */
  renderMessage(template: string, clientName: string, season: TyreSeason): string {
    return renderTyreSeasonReminderMessage(template, { name: clientName, season });
  }

  /**
   * Apelat periodic din scheduler (vezi cererea din raport pentru linia de cuplare în
   * `scheduler.service.ts` — NU e adăugată automat de acest agent). Nu face nimic dacă
   * remindere-le sunt oprite sau nu suntem în nicio fereastră activă.
   */
  async tick(messaging: MessagingService, notifications: NotificationService): Promise<void> {
    const st = this.status();
    if (!st.activeWindow) return;
    const notYetSent = st.eligible.filter((c) => !c.already_sent);
    if (notYetSent.length === 0) return;

    const settings = this.ctx.settings.get();
    if (settings.whatsapp.mode === 'cloud_api') {
      // Plafonul de reîncercări (MAX_AUTO_SEND_ATTEMPTS) se aplică DOAR trimiterii automate
      // — un client cu prea multe eșecuri automate rămâne totuși vizibil în pagina Remindere,
      // cu buton de trimitere manuală mereu activ (vezi `status()`, care nu filtrează după
      // `failed_attempts`).
      const pending = notYetSent.filter((c) => c.failed_attempts < MAX_AUTO_SEND_ATTEMPTS);
      for (const c of pending) {
        await this.sendCloudApiOne(messaging, c, st.settings.message_template);
      }
      return;
    }

    if (settings.whatsapp.mode === 'assisted') {
      this.notifyAssistedOnce(notifications, st.activeWindow, notYetSent.length);
    }
    // 'disabled': nimic de făcut — nu există niciun canal prin care să trimitem.
  }

  /**
   * Id-ul șablonului local „ancoră" pentru maparea Meta a reminder-elor de sezon (creat de
   * migrația 007, cu `active = 0`). Dacă lipsește — instalare foarte veche, migrată înainte
   * ca migrația 007 să existe, sau șters manual din Setări — îl recreăm defensiv aici, ca
   * fallback-ul de template din `MessagingService.sendWhatsappCloudApiAuto` să aibă mereu
   * un `templateUsedId` valid de căutat în `whatsapp_template_map`. Înainte de reparație,
   * acest id era `null`, iar fallback-ul eșua mereu, permanent, pentru toți clienții de sezon
   * (fereastra de conversație de 24h e aproape sigur închisă — ultimul contact a fost acum
   * ~6 luni) — vezi Defectul 2 din raportul de reparații.
   */
  private cloudApiTemplateId(): number {
    const raw = this.ctx.settings.getRaw(TEMPLATE_ID_SETTINGS_KEY);
    const id = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && this.ctx.messages.getTemplate(id)) return id;

    const created = this.ctx.messages.createTemplate({
      name: 'NU ACTIVA — Cauciucuri: reminder sezon (mapare Meta)',
      channel: 'whatsapp',
      subject: null,
      body:
        'Șablon tehnic — folosit doar ca ancoră pentru maparea Meta a reminder-elor automate ' +
        'de sezon (Cauciucuri). NU activa acest șablon din Setări → Mesaje → Șabloane — ar ' +
        'dezactiva șablonul WhatsApp implicit al DDD-ului. Configurează maparea Meta din ' +
        'Setări → WhatsApp → Mapare template-uri.',
    });
    this.ctx.settings.setRaw(TEMPLATE_ID_SETTINGS_KEY, String(created.id));
    return created.id;
  }

  private async sendCloudApiOne(
    messaging: MessagingService,
    client: TyreSeasonReminderEligibleClient,
    template: string,
  ): Promise<void> {
    if (!client.client_phone) {
      this.ctx.logger.warn(`Reminder sezon: clientul cauciucuri #${client.client_id} nu are telefon`);
      return;
    }
    const phone = normalizePhoneE164(client.client_phone);
    if (!phone) {
      this.ctx.logger.warn(`Reminder sezon: telefonul clientului #${client.client_id} nu pare valid`);
      return;
    }
    const body = this.renderMessage(template, client.client_name, client.season);

    // Nu există un rând `contacts` (DDD) pentru clienții Cauciucuri — construim un
    // contact sintetic, nepersistat, exact ca în `daily-digest.service.ts`.
    const syntheticContact: Contact = {
      id: 0,
      association_id: 0,
      name: client.client_name,
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

    const templateUsedId = this.cloudApiTemplateId();
    const result = await messaging.sendWhatsappCloudApiAuto(syntheticContact, phone, body, null, templateUsedId);
    this.ctx.tyreMessageLog.insert({
      client_id: client.client_id,
      source: 'season_reminder',
      season: client.season,
      season_key: this.seasonKeyFor(client.season),
      recipient: client.client_phone,
      message_preview: body,
      status: result.ok ? 'sent' : 'failed',
      error_message: result.ok ? null : (result.error ?? null),
      created_at: this.ctx.nowLocalIso(),
    });
    if (!result.ok) {
      this.ctx.logger.error(
        `Reminder sezon eșuat pentru clientul cauciucuri #${client.client_id}: ${result.error}`,
      );
    }
  }

  private notifyAssistedOnce(notifications: NotificationService, season: TyreSeason, pendingCount: number): void {
    const key = `${ASSISTED_NOTIFIED_KEY_PREFIX}::${season}`;
    const today = this.ctx.todayIso();
    if (this.ctx.settings.getRaw(key) === today) return;

    const seasonLabel = tyreSeasonLabels[season].toLowerCase();
    notifications.show(
      `Tonik · Remindere cauciucuri de ${seasonLabel}`,
      `${pendingCount} ${pluralRo(pendingCount, 'client de contactat', 'clienți de contactat')} pentru schimbul de ${seasonLabel}. Apasă pentru pagina Remindere.`,
      '/cauciucuri/remindere',
    );
    this.ctx.settings.setRaw(key, today);
  }
}

function isInWindow(today: Date, window: TyreSeasonWindow): boolean {
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  const start = window.start.month * 100 + window.start.day;
  const end = window.end.month * 100 + window.end.day;
  if (start <= end) return md >= start && md <= end;
  // Fereastră ce trece peste anul nou (ex. 1 dec - 31 ian).
  return md >= start || md <= end;
}
