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
import type { NotificationService } from './notification.service';
import type { MessagingService } from './messaging/messaging.service';
import type { DailyDigestService } from './daily-digest.service';
import type { LicenseService } from './license.service';
import { formatRo } from '../../shared/dates';
import { renderEmailHtml, textToHtml, logoAttachment } from './messaging/email-template';
import { normalizePhoneE164 } from './messaging/template-render';
import type { TyreSeasonReminderService } from './tyre-season-reminder.service';
import type { Reminder } from '../../shared/schemas/reminder';

const TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minute (spec #19)
const MAX_AUTO_ATTEMPTS = 3; // limita de retry automat (spec #42)

/**
 * Scheduler local: rulează imediat la pornire și apoi periodic.
 * Reminderele ratate cât timp PC-ul a fost oprit sunt procesate la pornire (spec #20).
 */
export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Gardă de reintrare: un tick nou iese imediat dacă unul e deja în curs (spec #3). */
  private ticking = false;

  constructor(
    private ctx: AppContext,
    private notifications: NotificationService,
    private messaging: MessagingService,
    private digest?: DailyDigestService,
    private license?: LicenseService,
    private tyreSeasonReminder?: TyreSeasonReminderService,
  ) {}

  start(): void {
    // Recuperăm reminderele rămase blocate pe 'processing' dintr-o cădere anterioară
    // a aplicației, înainte de primul tick (spec #4).
    const recovered = this.ctx.reminders.sweepStuckProcessing();
    if (recovered > 0) {
      this.ctx.logger.warn(
        `Scheduler: ${recovered} remindere rămase blocate pe 'processing' au fost marcate 'failed'.`,
      );
    }

    // La pornire: procesăm tot ce e restant, cu digest pentru cele overdue.
    this.tick(true).catch((err) => this.ctx.logger.error('Scheduler: eroare la pornire', err));
    this.timer = setInterval(() => {
      this.tick(false).catch((err) => this.ctx.logger.error('Scheduler: eroare la tick', err));
    }, TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(isStartup: boolean): Promise<void> {
    // Gardă de reintrare: setInterval (10 min) + apelul de la pornire se pot suprapune
    // dacă un tick anterior încă așteaptă requesturi de rețea — fără gardă, tick-urile
    // paralele ar putea trimite același reminder de două ori (spec #3).
    if (this.ticking) {
      this.ctx.logger.warn('Scheduler: tick anterior încă rulează, sar peste acest tick.');
      return;
    }
    this.ticking = true;
    try {
      // Fără licență validă nu se trimite nimic automat.
      if (this.license && this.license.check().status !== 'valid') return;

      // Raportul zilnic „planul zilei” — își verifică singur ora și ziua.
      await this.digest?.tick();

      // Reminderele de sezon la cauciucuri — își verifică singure fereastra de
      // sezon și garda „un mesaj per client per fereastră”.
      await this.tyreSeasonReminder?.tick(this.messaging, this.notifications);

      const now = this.ctx.nowLocalIso();
      const today = this.ctx.todayIso();
      const due = this.ctx.reminders.listDue(now);
      if (due.length === 0) return;

      this.ctx.logger.info(`Scheduler: ${due.length} remindere de procesat`);

      // Reminderele mai vechi decât azi sunt „restante” — la pornire le anunțăm
      // printr-un singur digest, nu printr-o avalanșă de notificări.
      const overdue = due.filter((r) => r.scheduled_at.slice(0, 10) < today);
      const current = due.filter((r) => r.scheduled_at.slice(0, 10) >= today);

      if (isStartup && overdue.length > 0) {
        this.notifications.show(
          'DDD Manager',
          `${overdue.length} ${overdue.length === 1 ? 'reminder restant' : 'remindere restante'} din perioada în care aplicația a fost închisă.`,
          '/remindere',
        );
      }

      for (const reminder of [...overdue, ...current]) {
        await this.processReminder(reminder, isStartup && overdue.includes(reminder));
      }
      this.ctx.notifyDataChanged();
    } finally {
      this.ticking = false;
    }
  }

  private async processReminder(reminder: Reminder, silent: boolean): Promise<void> {
    const followup = this.ctx.followups.getById(reminder.followup_id);
    if (!followup || !['pending', 'contacted', 'scheduled'].includes(followup.status)) {
      this.ctx.reminders.setStatus(reminder.id, 'cancelled');
      return;
    }
    const association = this.ctx.associations.getById(followup.association_id);
    if (!association || !association.active) {
      // Asociațiile inactive nu mai primesc remindere (spec #9).
      this.ctx.reminders.setStatus(reminder.id, 'skipped');
      return;
    }
    const service = this.ctx.services.getById(followup.service_id);
    const contact = this.ctx.contacts.getPrimaryForAssociation(association.id);

    // Claim atomic: dacă rândul nu mai e 'pending' (deja reclamat de un alt tick
    // suprapus), sărim peste el — previne dubla trimitere (spec #3).
    if (!this.ctx.reminders.claimForProcessing(reminder.id)) return;
    this.ctx.reminders.recordAttempt(reminder.id);

    try {
      switch (reminder.channel) {
        case 'internal':
          if (!silent) {
            this.notifications.show(
              'DDD Manager',
              `${association.name} trebuie contactată. ${service?.name ?? 'Serviciul'} ajunge la termen pe ${formatRo(followup.due_date)}.`,
              `/asociatii/${association.id}`,
            );
          }
          this.ctx.reminders.setStatus(reminder.id, 'sent');
          break;

        case 'whatsapp': {
          // WhatsApp automat doar în modul Cloud API, cu contact eligibil (permite
          // WhatsApp, are telefon, nu e „Nu contacta”); altfel comportamentul de azi —
          // reminderul devine notificare internă care cere acțiunea utilizatorului.
          const whatsappMode = this.ctx.settings.get().whatsapp.mode;
          const canAutoSend =
            whatsappMode === 'cloud_api' &&
            !!contact &&
            !contact.do_not_contact &&
            contact.allow_whatsapp &&
            !!contact.phone;

          if (canAutoSend) {
            const phone = normalizePhoneE164(contact!.phone!);
            if (!phone) {
              this.failOrRetry(
                reminder,
                `Numărul de telefon al contactului „${contact!.name}” nu pare valid.`,
              );
              break;
            }
            const { body, templateUsedId } = this.messaging.buildMessage(
              contact!.id,
              followup.id,
              'whatsapp',
            );
            const result = await this.messaging.sendWhatsappCloudApiAuto(
              contact!,
              phone,
              body,
              followup.id,
              templateUsedId,
            );
            this.ctx.messages.insertLog({
              association_id: association.id,
              contact_id: contact!.id,
              followup_id: followup.id,
              reminder_id: reminder.id,
              channel: 'whatsapp',
              recipient: contact!.phone!,
              template_id: templateUsedId,
              message_preview: body,
              status: result.ok ? 'accepted_by_provider' : 'failed',
              provider_message_id: result.wamid ?? null,
              error_message: result.error ?? null,
            });
            if (result.ok) {
              this.ctx.reminders.setStatus(reminder.id, 'sent');
            } else {
              this.failOrRetry(reminder, result.error ?? 'Trimitere WhatsApp eșuată');
            }
            break;
          }

          if (contact?.do_not_contact) {
            // Regula do_not_contact (spec #43): doar notificare internă.
            if (!silent) {
              this.notifications.show(
                'DDD Manager',
                `${association.name}: ${service?.name ?? ''} ajunge la termen pe ${formatRo(followup.due_date)} (contactul are „Nu contacta”).`,
                `/asociatii/${association.id}`,
              );
            }
            this.ctx.reminders.setStatus(reminder.id, 'skipped');
            break;
          }
          if (!silent) {
            this.notifications.show(
              'DDD Manager',
              `${association.name} trebuie contactată pe WhatsApp. ${service?.name ?? ''} ajunge la termen pe ${formatRo(followup.due_date)}.`,
              `/asociatii/${association.id}`,
            );
          }
          this.ctx.reminders.setStatus(reminder.id, 'sent');
          break;
        }

        case 'email': {
          if (contact?.do_not_contact || !contact?.allow_email || !contact?.email) {
            this.ctx.reminders.setStatus(reminder.id, 'skipped');
            break;
          }
          const { body, subject, templateUsedId } = this.messaging.buildMessage(contact.id, followup.id, 'email');
          if (!body.trim()) {
            this.failOrRetry(
              reminder,
              templateUsedId === null
                ? 'Nu se poate trimite: niciun șablon activ pe canalul email.'
                : 'Șablonul activ pe canalul email produce un mesaj gol.',
            );
            break;
          }
          const result = await this.messaging.emailProvider().send({
            to: contact.email,
            subject: subject ?? `Programare ${service?.name ?? ''}`,
            body,
            html: renderEmailHtml(textToHtml(body), this.ctx.settings.get().company),
            attachments: [logoAttachment()],
          });
          this.ctx.messages.insertLog({
            association_id: association.id,
            contact_id: contact.id,
            followup_id: followup.id,
            reminder_id: reminder.id,
            channel: 'email',
            recipient: contact.email,
            template_id: null,
            message_preview: body,
            status: result.ok ? 'accepted_by_provider' : 'failed',
            provider_message_id: result.providerMessageId ?? null,
            error_message: result.error ?? null,
          });
          if (result.ok) {
            this.ctx.reminders.setStatus(reminder.id, 'sent');
          } else {
            this.failOrRetry(reminder, result.error ?? 'Trimitere eșuată');
          }
          break;
        }
      }
    } catch (err) {
      this.ctx.logger.error(`Scheduler: eroare la reminder #${reminder.id}`, err);
      this.failOrRetry(reminder, err instanceof Error ? err.message : String(err));
    }
  }

  /** Retry limitat: după MAX_AUTO_ATTEMPTS reminderul devine failed (spec #42). */
  private failOrRetry(reminder: Reminder, error: string): void {
    const fresh = this.ctx.reminders.getById(reminder.id);
    const attempts = fresh?.attempt_count ?? reminder.attempt_count + 1;
    if (attempts >= MAX_AUTO_ATTEMPTS) {
      this.ctx.reminders.setStatus(reminder.id, 'failed', error);
    } else {
      // Rămâne pending — următorul tick reîncearcă.
      this.ctx.reminders.setStatus(reminder.id, 'pending', error);
    }
  }

  /** Numărul de remindere programate pentru azi (pentru meniul din tray). */
  countToday(): number {
    const today = this.ctx.todayIso();
    return this.ctx.reminders.list({ window: 'today', page: 1, pageSize: 1 }, today).total;
  }
}
