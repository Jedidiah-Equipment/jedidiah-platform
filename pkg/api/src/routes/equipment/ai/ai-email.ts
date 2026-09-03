import type { AiEmailSender } from '@pkg/ai';
import { renderPlainTextEmailHtml } from '@pkg/domain';

import { emailSender } from '@/email/index.js';

export const sendAiEmail: AiEmailSender = (message) =>
  emailSender.send({
    attachments: message.attachments,
    html: renderPlainTextEmailHtml(message.body),
    subject: message.subject,
    text: message.body,
    to: message.to,
    type: 'assistant',
  });
