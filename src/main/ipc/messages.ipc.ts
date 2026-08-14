import { z } from 'zod';
import { handle, UserFacingError } from './register';
import { IPC } from '../../shared/ipc-contract';
import {
  messageTemplateCreateSchema,
  messageTemplateUpdateSchema,
  sendMessageSchema,
  markMessageSentSchema,
  messageLogFilterSchema,
} from '../../shared/schemas/message';
import { idSchema } from '../../shared/schemas/common';
import type { AppContext } from '../app-context';
import type { MessagingService } from '../services/messaging/messaging.service';

const previewSchema = z.object({
  contact_id: idSchema,
  followup_id: idSchema.nullish().transform((v) => v ?? null),
  channel: z.enum(['whatsapp', 'email', 'sms']),
  template_id: idSchema.nullish().transform((v) => v ?? null),
});

export function registerMessageHandlers(ctx: AppContext, messaging: MessagingService): void {
  handle(IPC.messages.templates.list, null, () => ctx.messages.listTemplates());
  handle(IPC.messages.templates.create, messageTemplateCreateSchema, (data) =>
    ctx.messages.createTemplate(data),
  );
  handle(IPC.messages.templates.update, messageTemplateUpdateSchema, (data) =>
    ctx.messages.updateTemplate(data),
  );

  handle(IPC.messages.preview, previewSchema, (input) => {
    const { body, subject } = messaging.buildMessage(
      input.contact_id,
      input.followup_id,
      input.channel,
      input.template_id,
    );
    return { body, subject };
  });

  handle(IPC.messages.send, sendMessageSchema, async (input) => {
    const log = await messaging.send(input);
    ctx.notifyDataChanged();
    return log;
  });

  handle(IPC.messages.markSent, markMessageSentSchema, ({ id }) => {
    const log = ctx.messages.getLog(id);
    if (!log) throw new UserFacingError('Mesajul nu a fost găsit.');
    if (!['prepared', 'opened'].includes(log.status)) {
      throw new UserFacingError('Doar mesajele pregătite pot fi confirmate.');
    }
    ctx.messages.setLogStatus(id, 'confirmed_sent');
    ctx.notifyDataChanged();
    return ctx.messages.getLog(id);
  });

  handle(IPC.messages.log, messageLogFilterSchema, (filter) => ctx.messages.listLogs(filter));

  handle(IPC.messages.counts, null, () => ctx.messages.statusCounts());
}
