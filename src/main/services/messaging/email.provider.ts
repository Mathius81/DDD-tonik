import nodemailer from 'nodemailer';
import type { SmtpSettings } from '../../../shared/schemas/settings';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
  verify(): Promise<void>;
}

/** Provider SMTP configurabil (spec #38). */
export class SmtpEmailProvider implements EmailProvider {
  constructor(
    private settings: SmtpSettings,
    private password: string | null,
  ) {}

  private transport() {
    if (!this.settings.host) throw new Error('SMTP neconfigurat');
    return nodemailer.createTransport({
      host: this.settings.host,
      port: this.settings.port,
      secure: this.settings.secure,
      auth: this.settings.username
        ? { user: this.settings.username, pass: this.password ?? '' }
        : undefined,
    });
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transport().sendMail({
        from: this.settings.from_name
          ? `"${this.settings.from_name}" <${this.settings.from_email}>`
          : this.settings.from_email,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async verify(): Promise<void> {
    await this.transport().verify();
  }
}

/** Interfață pregătită pentru SMS — fără implementare reală în V1 (spec #39). */
export interface SmsProvider {
  send(to: string, body: string): Promise<SendResult>;
}
