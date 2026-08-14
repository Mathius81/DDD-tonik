import { shell } from 'electron';
import type { AppContext } from '../../app-context';
import type { SecretsService } from '../secrets.service';
import { renderTemplate, normalizePhoneE164, type TemplateContext } from './template-render';
import { SmtpEmailProvider } from './email.provider';
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

  /** Construiește corpul mesajului din template pentru un contact + followup. */
  buildMessage(
    contactId: number,
    followupId: number | null,
    channel: 'whatsapp' | 'email' | 'sms',
    templateId?: number | null,
  ): { body: string; subject: string | null; contact: Contact; templateUsedId: number | null } {
    const contact = this.ctx.contacts.getById(contactId);
    if (!contact) throw new UserFacingError('Contactul nu a fost găsit.');

    const followup = followupId ? this.ctx.followups.getById(followupId) : undefined;
    const association = this.ctx.associations.getById(contact.association_id);
    const service = followup ? this.ctx.services.getById(followup.service_id) : undefined;
    const settings = this.ctx.settings.get();

    const template = templateId
      ? this.ctx.messages.getTemplate(templateId)
      : this.ctx.messages.getActiveTemplateForChannel(channel === 'sms' ? 'whatsapp' : channel);

    const templateCtx: TemplateContext = {
      contact_name: contact.name,
      association_name: association?.name ?? '',
      service_name: service?.name ?? '',
      due_date: followup?.due_date ?? this.ctx.todayIso(),
      todayIso: this.ctx.todayIso(),
      company: settings.company,
    };

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

    if (log.channel === 'whatsapp') {
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
      message_preview: body.slice(0, 500),
      status: 'prepared',
    });
    this.ctx.logger.info(`WhatsApp asistat deschis pentru contact #${contact.id}`);
    return log;
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
        message_preview: body.slice(0, 500),
        status: 'prepared',
      });
      this.ctx.logger.info(`Email asistat (mailto) deschis pentru contact #${contact.id}`);
      return log;
    }

    const provider = this.emailProvider();
    const result = await provider.send({ to: contact.email, subject, body });

    const log = this.ctx.messages.insertLog({
      association_id: contact.association_id,
      contact_id: contact.id,
      followup_id: input.followup_id,
      reminder_id: input.reminder_id,
      channel: 'email',
      recipient: contact.email,
      template_id: input.template_id ?? templateUsedId,
      message_preview: body.slice(0, 500),
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
}
