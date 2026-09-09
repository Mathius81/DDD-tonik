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
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  administratorPhoneSchema,
  administratorPhonesSchema,
  administratorWhatsappSendSchema,
  type AdministratorGroup,
} from '../../shared/schemas/contact';
import { formatRo } from '../../shared/dates';
import { normalizePhoneE164 } from '../services/messaging/template-render';
import type { AppContext } from '../app-context';

/**
 * Textul agregat cu situația TUTUROR asociațiilor unei persoane (identificată după
 * telefon) — inclusiv cele „la zi”, exact cum a cerut clientul: „să văd ce a făcut și ce
 * nu a făcut”. Funcție pură (fără acces la bază), testabilă direct.
 */
export function buildAdministratorSituationMessage(
  group: AdministratorGroup,
  companyPhone: string,
  companyName: string,
): string {
  const lines: string[] = [
    `Bună ziua, ${group.display_name}.`,
    '',
    'Situația asociațiilor dumneavoastră:',
  ];
  for (const a of group.associations) {
    if (a.open_followups.length === 0) {
      lines.push(`• ${a.association_name} — la zi`);
      continue;
    }
    const details = a.open_followups
      .map((f) => `${f.service_name}, ${f.overdue ? 'restantă din' : 'scadentă'} ${formatRo(f.due_date)}`)
      .join('; ');
    lines.push(`• ${a.association_name} — ${details}`);
  }
  lines.push('', `Pentru programare ne puteți contacta la ${companyPhone}.`);
  if (companyName) lines.push('', companyName);
  return lines.join('\n');
}

/**
 * Handlere IPC pentru „Administratori” — administratorii cu mai multe asociații,
 * identificați după telefon (fără nicio schimbare de schemă, vezi `contacts.repo.ts`).
 * Trimiterea rămâne în modul asistat (wa.me), la fel ca `sendWhatsappAssisted` din
 * `messaging.service.ts` / `TyreWhatsappButton`: se deschide conversația cu textul
 * pregătit, utilizatorul apasă Send manual.
 */
export function registerAdministratorHandlers(ctx: AppContext): void {
  handle(IPC.administrators.list, null, () => ctx.contacts.listAdministratorGroups(ctx.todayIso()));

  handle(IPC.administrators.getByPhones, administratorPhonesSchema, ({ phones }) =>
    ctx.contacts.getAdministratorGroupsForPhones(phones, ctx.todayIso()),
  );

  handle(IPC.administrators.preview, administratorPhoneSchema, ({ phone }) => {
    const group = ctx.contacts.getAdministratorGroupByPhone(phone, ctx.todayIso());
    if (!group) throw new UserFacingError('Nu am găsit nicio persoană cu acest telefon.');
    const company = ctx.settings.get().company;
    return { body: buildAdministratorSituationMessage(group, company.phone, company.name) };
  });

  handle(IPC.administrators.whatsapp.send, administratorWhatsappSendSchema, async ({ phone, message }) => {
    const group = ctx.contacts.getAdministratorGroupByPhone(phone, ctx.todayIso());
    if (!group) throw new UserFacingError('Nu am găsit nicio persoană cu acest telefon.');

    const normalizedPhone = normalizePhoneE164(group.phone_display) ?? group.phone;
    const url = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    await shell.openExternal(url);

    // Alegere pentru log (FK-uri nullable, migrația 001): mesajul agregat nu aparține unei
    // singure asociații, dar rândul din `message_logs` tot trebuie ancorat de ceva, ca să
    // nu fie „orfan” în pagina Mesaje. Folosim PRIMA asociație din grup (sortate alfabetic
    // în `contacts.repo.ts`) și contactul ei concret — textul complet, cu TOATE
    // asociațiile, rămâne oricum salvat integral în `message_preview`.
    const firstAssociation = group.associations[0];

    const log = ctx.messages.insertLog({
      association_id: firstAssociation?.association_id ?? null,
      contact_id: firstAssociation?.contact_id ?? null,
      followup_id: null,
      reminder_id: null,
      channel: 'whatsapp',
      recipient: group.phone_display,
      template_id: null,
      message_preview: message.slice(0, 500),
      status: 'prepared',
    });
    ctx.logger.info(
      `WhatsApp asistat (situație agregată, ${group.associations_count} asociații) deschis pentru #${log.id}`,
    );
    return { opened: true };
  });
}
