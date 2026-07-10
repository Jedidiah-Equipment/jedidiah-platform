import type { AiV2EmailSender } from '@pkg/ai';
import { renderPlainTextEmailHtml } from '@pkg/domain';

import { emailSender } from '@/email/index.js';

export const sendAiV2Email: AiV2EmailSender = (message) =>
  emailSender.send({
    attachments: message.attachments,
    html: renderPlainTextEmailHtml(message.body),
    subject: message.subject,
    text: message.body,
    to: message.to,
    type: 'assistant',
  });
