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
import type { AppContext } from '../../app-context';
import type { SecretsService } from '../secrets.service';
import { renderTemplate, normalizePhoneE164, type TemplateContext } from './template-render';
import { SmtpEmailProvider } from './email.provider';
import { renderEmailHtml, textToHtml, logoAttachment } from './email-template';
import {
  WhatsappCloudProvider,
  WHATSAPP_REENGAGEMENT_ERROR_CODE,
  WHATSAPP_DRY_RUN_ERROR_MESSAGE,
  type WhatsappSendResult,
} from './whatsapp.provider';
import { UserFacingError } from '../../ipc/register';
import type { SendMessageInput, MessageLog } from '../../../shared/schemas/message';
import type { Contact } from '../../../shared/schemas/contact';

/**
 * Serviciul de mesagerie: WhatsApp asistat + email SMTP.
 * Toate URL-urile externe și requesturile pleacă din main, niciodată din renderer.
 */
export class MessagingService {
  constructor(
    private ctx: AppContext,
    private secrets: SecretsService,
  ) {}

  /** Contextul de variabile pentru un contact + followup — comun template-urilor obișnuite și celor Meta. */
  private templateContextFor(contact: Contact, followupId: number | null): TemplateContext {
    const followup = followupId ? this.ctx.followups.getById(followupId) : undefined;
    const association = this.ctx.associations.getById(contact.association_id);
    const service = followup ? this.ctx.services.getById(followup.service_id) : undefined;
    const settings = this.ctx.settings.get();
    return {
      contact_name: contact.name,
      association_name: association?.name ?? '',
      service_name: service?.name ?? '',
      due_date: followup?.due_date ?? this.ctx.todayIso(),
      todayIso: this.ctx.todayIso(),
      company: settings.company,
    };
  }

  /** Construiește corpul mesajului din template pentru un contact + followup. */
  buildMessage(
    contactId: number,
    followupId: number | null,
    channel: 'whatsapp' | 'email' | 'sms',
    templateId?: number | null,
  ): { body: string; subject: string | null; contact: Contact; templateUsedId: number | null } {
    const contact = this.ctx.contacts.getById(contactId);
    if (!contact) throw new UserFacingError('Contactul nu a fost găsit.');

    const template = templateId
      ? this.ctx.messages.getTemplate(templateId)
      : this.ctx.messages.getActiveTemplateForChannel(channel === 'sms' ? 'whatsapp' : channel);

    const templateCtx = this.templateContextFor(contact, followupId);

    const body = template ? renderTemplate(template.body, templateCtx) : '';
    const subject = template?.subject ? renderTemplate(template.subject, templateCtx) : null;
    return { body, subject, contact, templateUsedId: template?.id ?? null };
  }

  /** Trimite/pregătește un mesaj cerut explicit de utilizator din UI. */
  async send(input: SendMessageInput): Promise<MessageLog> {
    const { body, subject, contact, templateUsedId } = this.buildMessage(
      input.contact_id,
      input.followup_id,
      input.channel,
      input.template_id,
    );
    const finalBody = input.body_override ?? body;
    if (!finalBody.trim()) throw new UserFacingError('Mesajul este gol.');

    if (contact.do_not_contact) {
      throw new UserFacingError('Contactul este marcat „Nu contacta”.');
    }

    if (input.channel === 'whatsapp') {
      // Rutare pe modul configurat (spec „mod automat" Cloud API, lângă cel asistat).
      const mode = this.ctx.settings.get().whatsapp.mode;
      if (mode === 'disabled') {
        throw new UserFacingError(
          'Trimiterea prin WhatsApp este dezactivată. Activeaz-o din Setări → WhatsApp.',
        );
      }
      if (mode === 'cloud_api') {
        return this.sendWhatsappCloudApi(contact, finalBody, input, templateUsedId);
      }
      return this.sendWhatsappAssisted(contact, finalBody, input);
    }
    if (input.channel === 'email') {
      return this.sendEmail(contact, subject ?? 'Programare intervenție', finalBody, input, templateUsedId);
    }
    throw new UserFacingError('SMS va fi disponibil într-o versiune viitoare.');
  }

  /**
   * Retrimite un mesaj rămas „pregătit” sau eșuat, folosind conținutul lui original:
   * - email: trimite prin SMTP (dacă e configurat acum) sau redeschide mailto;
   * - whatsapp: redeschide conversația cu textul pregătit.
   * Actualizează același rând de log, nu creează unul nou.
   */
  async resend(logId: number): Promise<MessageLog> {
    const log = this.ctx.messages.getLog(logId);
    if (!log) throw new UserFacingError('Mesajul nu a fost găsit.');
    if (!['prepared', 'opened', 'failed'].includes(log.status)) {
      throw new UserFacingError('Doar mesajele pregătite sau eșuate pot fi retrimise.');
    }
    const contact = log.contact_id ? this.ctx.contacts.getById(log.contact_id) : undefined;
    if (!contact) throw new UserFacingError('Contactul mesajului nu mai există.');
    if (contact.do_not_contact) throw new UserFacingError('Contactul este marcat „Nu contacta”.');

    const body = log.message_preview;
    // Versiunile vechi salvau numai primele 500 de caractere (la fel și jurnalul
    // WhatsApp al scheduler-ului). Nu putem deosebi o astfel de copie de un text
    // complet de exact 500 de caractere; refuzăm prudent, fără a inventa restul.
    if (body.length === 500) {
      throw new UserFacingError(
        'Textul salvat poate fi trunchiat la 500 de caractere. Compune un mesaj nou din fișa contactului sau din Administratori.',
      );
    }
    if (!body.trim()) throw new UserFacingError('Mesajul salvat este gol. Compune un mesaj nou.');

    if (log.channel === 'whatsapp') {
      // Un mesaj agregat este ancorat doar de primul contact; interdicția poate
      // aparține altei asociații sau unui duplicat al aceluiași administrator.
      if (contact.phone && this.ctx.contacts.getAdministratorGroupByPhone(contact.phone, this.ctx.todayIso())?.do_not_contact) {
        throw new UserFacingError('Contactul este marcat „Nu contacta”.');
      }
      if (!contact.phone) throw new UserFacingError('Contactul nu are număr de telefon.');
      const phone = normalizePhoneE164(contact.phone);
      if (!phone) throw new UserFacingError(`Numărul „${contact.phone}” nu pare valid.`);
      await shell.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`);
      this.ctx.messages.setLogStatus(log.id, 'opened');
      return this.ctx.messages.getLog(log.id)!;
    }

    if (log.channel === 'email') {
      if (!contact.email) throw new UserFacingError('Contactul nu are adresă de email.');
      // Reconstruim subiectul din template-ul folosit inițial (sau unul implicit).
      const { subject } = this.buildMessage(contact.id, log.followup_id, 'email', log.template_id);
      if (!this.ctx.settings.get().smtp.host) {
        const mailto = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject ?? 'Programare intervenție')}&body=${encodeURIComponent(body)}`;
        await shell.openExternal(mailto);
        this.ctx.messages.setLogStatus(log.id, 'prepared');
        return this.ctx.messages.getLog(log.id)!;
      }
      const result = await this.emailProvider().send({
        to: contact.email,
        subject: subject ?? 'Programare intervenție',
        body,
        html: renderEmailHtml(textToHtml(body), this.ctx.settings.get().company),
        attachments: [logoAttachment()],
      });
      this.ctx.messages.setLogStatus(
        log.id,
        result.ok ? 'accepted_by_provider' : 'failed',
        result.error ?? null,
      );
      if (!result.ok) {
        this.ctx.logger.error(`Retrimitere email eșuată pentru log #${log.id}: ${result.error}`);
        throw new UserFacingError('Mesajul nu a putut fi trimis. Verifică setările de email.');
      }
      return this.ctx.messages.getLog(log.id)!;
    }

    throw new UserFacingError('SMS va fi disponibil într-o versiune viitoare.');
  }

  private async sendWhatsappAssisted(
    contact: Contact,
    body: string,
    input: SendMessageInput,
  ): Promise<MessageLog> {
    if (!contact.allow_whatsapp) throw new UserFacingError('Contactul nu permite WhatsApp.');
    if (!contact.phone) throw new UserFacingError('Contactul nu are număr de telefon.');
    const phone = normalizePhoneE164(contact.phone);
    if (!phone) {
      throw new UserFacingError(
        `Numărul de telefon „${contact.phone}” nu pare valid. Corectează-l în fișa contactului.`,
      );
    }

    // Mod asistat (spec #33): deschidem conversația cu mesajul pregătit.
    // Statusul rămâne 'prepared' până confirmă utilizatorul trimiterea.
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
    await shell.openExternal(url);

    const log = this.ctx.messages.insertLog({
      association_id: contact.association_id,
      contact_id: contact.id,
      followup_id: input.followup_id,
      reminder_id: input.reminder_id,
      channel: 'whatsapp',
      recipient: contact.phone,
      template_id: input.template_id,
      message_preview: body,
      status: 'prepared',
    });
    this.ctx.logger.info(`WhatsApp asistat deschis pentru contact #${contact.id}`);
    return log;
  }

  /** Trimitere explicită (din UI) prin WhatsApp Business Cloud API — mod „automat". */
  private async sendWhatsappCloudApi(
    contact: Contact,
    body: string,
    input: SendMessageInput,
    templateUsedId: number | null,
  ): Promise<MessageLog> {
    if (!contact.allow_whatsapp) throw new UserFacingError('Contactul nu permite WhatsApp.');
    if (!contact.phone) throw new UserFacingError('Contactul nu are număr de telefon.');
    const phone = normalizePhoneE164(contact.phone);
    if (!phone) {
      throw new UserFacingError(
        `Numărul de telefon „${contact.phone}” nu pare valid. Corectează-l în fișa contactului.`,
      );
    }

    const result = await this.sendWhatsappCloudApiAuto(
      contact,
      phone,
      body,
      input.followup_id,
      templateUsedId,
    );

    const log = this.ctx.messages.insertLog({
      association_id: contact.association_id,
      contact_id: contact.id,
      followup_id: input.followup_id,
      reminder_id: input.reminder_id,
      channel: 'whatsapp',
      recipient: contact.phone,
      template_id: input.template_id ?? templateUsedId,
      message_preview: body,
      status: result.ok ? 'accepted_by_provider' : 'failed',
      provider_message_id: result.wamid ?? null,
      error_message: result.error ?? null,
    });

    if (!result.ok) {
      this.ctx.logger.error(`WhatsApp Cloud API eșuat pentru contact #${contact.id}: ${result.error}`);
      throw new UserFacingError(result.error ?? 'Mesajul WhatsApp nu a putut fi trimis.');
    }
    return log;
  }

  /**
   * Trimite prin Cloud API cu strategia text-liber-cu-fallback-la-template: încearcă
   * întâi text liber (funcționează doar în fereastra de 24h de conversație); dacă Meta
   * răspunde cu 131047 (fereastra închisă), reîncearcă automat cu template-ul mapat
   * pentru `templateUsedId`. Nu aruncă — întoarce rezultatul brut, ca apelantul
   * (trimitere explicită sau scheduler) să-și scrie propriul log.
   */
  async sendWhatsappCloudApiAuto(
    contact: Contact,
    phone: string,
    body: string,
    followupId: number | null,
    templateUsedId: number | null,
  ): Promise<WhatsappSendResult> {
    const provider = this.whatsappProvider();
    if (provider.isDryRun()) {
      // Fără token sau Phone Number ID valide nu trimitem nimic real — și nu raportăm
      // succes simulat (spec: fără DRY-RUN tăcut). Reminderul trebuie să treacă prin
      // failOrRetry și să devină vizibil `failed`, nu `sent` pentru un mesaj inexistent.
      return { ok: false, error: WHATSAPP_DRY_RUN_ERROR_MESSAGE };
    }
    const result = await provider.sendText(phone, body);
    if (!result.ok && result.errorCode === WHATSAPP_REENGAGEMENT_ERROR_CODE) {
      return this.sendWhatsappTemplateFallback(provider, contact, phone, templateUsedId, followupId);
    }
    return result;
  }

  /** Fallback la template aprobat de Meta când fereastra de 24h s-a închis. */
  private async sendWhatsappTemplateFallback(
    provider: WhatsappCloudProvider,
    contact: Contact,
    phone: string,
    templateUsedId: number | null,
    followupId: number | null,
  ): Promise<WhatsappSendResult> {
    const mapping = templateUsedId ? this.ctx.messages.getWhatsappTemplateMap(templateUsedId) : undefined;
    if (!mapping) {
      return {
        ok: false,
        error:
          'Fereastra de 24h de conversație s-a închis, iar acest template nu are un template ' +
          'WhatsApp aprobat de Meta asociat. Configurează maparea din Setări → WhatsApp.',
      };
    }
    const templateCtx = this.templateContextFor(contact, followupId);
    const params = mapping.variables.map((v) => renderTemplate(`{{${v}}}`, templateCtx));
    return provider.sendTemplate(phone, mapping.meta_template_name, mapping.language, params);
  }

  private async sendEmail(
    contact: Contact,
    subject: string,
    body: string,
    input: SendMessageInput,
    templateUsedId: number | null,
  ): Promise<MessageLog> {
    if (!contact.allow_email) throw new UserFacingError('Contactul nu permite email.');
    if (!contact.email) throw new UserFacingError('Contactul nu are adresă de email.');

    // Fără SMTP configurat: mod asistat gratuit — deschidem aplicația de email
    // a utilizatorului cu mesajul precompletat (mailto:), la fel ca WhatsApp asistat.
    if (!this.ctx.settings.get().smtp.host) {
      const mailto = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      await shell.openExternal(mailto);
      const log = this.ctx.messages.insertLog({
        association_id: contact.association_id,
        contact_id: contact.id,
        followup_id: input.followup_id,
        reminder_id: input.reminder_id,
        channel: 'email',
        recipient: contact.email,
        template_id: input.template_id ?? templateUsedId,
        message_preview: body,
        status: 'prepared',
      });
      this.ctx.logger.info(`Email asistat (mailto) deschis pentru contact #${contact.id}`);
      return log;
    }

    const provider = this.emailProvider();
    const result = await provider.send({
      to: contact.email,
      subject,
      body,
      html: renderEmailHtml(textToHtml(body), this.ctx.settings.get().company),
      attachments: [logoAttachment()],
    });

    const log = this.ctx.messages.insertLog({
      association_id: contact.association_id,
      contact_id: contact.id,
      followup_id: input.followup_id,
      reminder_id: input.reminder_id,
      channel: 'email',
      recipient: contact.email,
      template_id: input.template_id ?? templateUsedId,
      message_preview: body,
      status: result.ok ? 'accepted_by_provider' : 'failed',
      provider_message_id: result.providerMessageId ?? null,
      error_message: result.error ?? null,
    });

    if (!result.ok) {
      this.ctx.logger.error(`Email eșuat către contact #${contact.id}: ${result.error}`);
      throw new UserFacingError('Mesajul nu a putut fi trimis. Verifică setările de email.');
    }
    return log;
  }

  emailProvider(): SmtpEmailProvider {
    const settings = this.ctx.settings.get();
    return new SmtpEmailProvider(settings.smtp, this.secrets.get('smtp_password'));
  }

  whatsappProvider(): WhatsappCloudProvider {
    const settings = this.ctx.settings.get().whatsapp;
    return new WhatsappCloudProvider(
      { phoneNumberId: settings.phone_number_id, accessToken: this.secrets.get('whatsapp_access_token') },
      this.ctx.logger,
    );
  }
}
