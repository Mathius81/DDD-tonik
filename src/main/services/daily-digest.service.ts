import type { AppContext } from '../app-context';
import type { MessagingService } from './messaging/messaging.service';
import { formatRo } from '../../shared/dates';
import { roLongDate, pluralRo, dueContext } from '../../shared/text';
import type { FollowupListItem } from '../../shared/schemas/followup';
import { renderEmailHtml, textToHtml, logoAttachment } from './messaging/email-template';

const LAST_DIGEST_KEY = 'last_daily_digest_date';

/**
 * Raportul zilnic „planul zilei”, trimis pe emailul configurat în Setări.
 * Rulează din scheduler: la ora setată sau la prima pornire de după ea
 * (catch-up dacă PC-ul a fost oprit la ora programată).
 */
export class DailyDigestService {
  constructor(
    private ctx: AppContext,
    private messaging: MessagingService,
  ) {}

  /** Apelat la fiecare tick al scheduler-ului. */
  async tick(): Promise<void> {
    const settings = this.ctx.settings.get();
    const digest = settings.daily_digest;
    const active = digest.recipients.filter((r) => r.active && r.email);
    if (!digest.enabled || active.length === 0 || !settings.smtp.host) return;

    const today = this.ctx.todayIso();
    if (this.ctx.settings.getRaw(LAST_DIGEST_KEY) === today) return;

    // Trimitem doar după ora configurată (sau la prima pornire de după).
    const now = this.ctx.now();
    const [hh, mm] = digest.send_at.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hh * 60 + mm) return;

    // Un singur corp de mesaj, trimis fiecărui destinatar activ.
    const failures: string[] = [];
    for (const recipient of active) {
      try {
        await this.send(recipient.email, today);
        this.ctx.logger.info(`Raport zilnic trimis către ${recipient.email}`);
      } catch (err) {
        failures.push(recipient.email);
        this.ctx.logger.error(`Raportul zilnic către ${recipient.email} a eșuat`, err);
      }
    }
    // Marcăm ziua doar dacă măcar un destinatar a primit; altfel reîncearcă tot lotul.
    if (failures.length < active.length) {
      this.ctx.settings.setRaw(LAST_DIGEST_KEY, today);
    }
  }

  /** Construiește și trimite raportul. Aruncă la eșec SMTP. */
  async send(to: string, todayIsoDate: string): Promise<void> {
    const body = this.buildBody(todayIsoDate);
    const result = await this.messaging.emailProvider().send({
      to,
      subject: `Planul zilei · ${formatRo(todayIsoDate)} · Tonik`,
      body,
      html: renderEmailHtml(textToHtml(body), this.ctx.settings.get().company),
      attachments: [logoAttachment()],
    });
    if (!result.ok) throw new Error(result.error ?? 'SMTP a refuzat mesajul');
  }

  buildBody(today: string): string {
    const scheduled = this.ctx.followups.listScheduledOn(today, today);
    const attention = this.ctx.followups.listAttention(today, 100);
    const overdue = attention.filter((f) => f.days_remaining < 0);
    const dueToday = attention.filter((f) => f.days_remaining === 0);
    const next7 = attention.filter((f) => f.days_remaining > 0 && f.days_remaining <= 7);
    const failed = this.ctx.reminders.countFailed() + this.ctx.messages.countFailed();

    const lines: string[] = [];
    lines.push(`Planul zilei — ${roLongDate(this.ctx.now())}`);
    lines.push('');

    const fmtRow = (f: FollowupListItem, extra?: string) => {
      const contact = f.primary_contact_name
        ? ` · ${f.primary_contact_name}${f.primary_contact_phone ? ` (${f.primary_contact_phone})` : ''}`
        : '';
      return `  • ${f.association_name} — ${f.service_name}${extra ?? ''}${contact}`;
    };

    if (scheduled.length > 0) {
      lines.push(`PROGRAMATE ASTĂZI (${scheduled.length})`);
      for (const f of scheduled) {
        lines.push(fmtRow(f, f.scheduled_time ? ` · ora ${f.scheduled_time}` : ''));
      }
      lines.push('');
    }

    if (dueToday.length > 0) {
      lines.push(`AJUNG LA TERMEN ASTĂZI (${dueToday.length}) — de contactat`);
      for (const f of dueToday) lines.push(fmtRow(f));
      lines.push('');
    }

    if (overdue.length > 0) {
      lines.push(`RESTANTE (${overdue.length}) — de contactat urgent`);
      for (const f of overdue) {
        lines.push(fmtRow(f, ` · ${dueContext(f.days_remaining).label}`));
      }
      lines.push('');
    }

    if (next7.length > 0) {
      lines.push(`URMĂTOARELE 7 ZILE (${next7.length})`);
      for (const f of next7) {
        lines.push(fmtRow(f, ` · ${formatRo(f.due_date)} (${dueContext(f.days_remaining).label})`));
      }
      lines.push('');
    }

    if (failed > 0) {
      lines.push(`⚠ ${pluralRo(failed, 'mesaj eșuat necesită', 'mesaje eșuate necesită')} atenție în aplicație.`);
      lines.push('');
    }

    if (scheduled.length === 0 && dueToday.length === 0 && overdue.length === 0 && next7.length === 0) {
      lines.push('Nimic urgent astăzi — totul este la zi. ✓');
      lines.push('');
    }

    lines.push('—');
    lines.push('Trimis automat de Tonik.');
    return lines.join('\n');
  }
}
