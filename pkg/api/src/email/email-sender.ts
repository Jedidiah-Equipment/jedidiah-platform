import { Resend } from 'resend';
import type { ApiConfig } from '../env.js';
import { log } from '../logger.js';
import { recordMockEmail } from './mock-email.js';

export type EmailType = 'email-verification' | 'password-reset';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  url: string;
  token: string;
  type: EmailType;
}

export interface EmailSender {
  send(payload: EmailPayload): Promise<void>;
}

export function createEmailSender(config: ApiConfig): EmailSender {
  if (config.EMAIL_PROVIDER === 'resend') {
    return createResendSender(config);
  }
  return createMockSender(config);
}

function createResendSender(config: ApiConfig): EmailSender {
  const resend = new Resend(config.RESEND_API_KEY);
  const from = config.EMAIL_FROM;

  return {
    send: async (payload) => {
      const { data, error } = await resend.emails.send({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      if (error) {
        throw new Error(`Failed to send email via Resend: ${error.message}`);
      }

      log.service.info(`[resend] ${payload.type} sent to ${payload.to} (id: ${data?.id ?? 'unknown'})`);
    },
  };
}

function createMockSender(config: ApiConfig): EmailSender {
  return {
    send: (payload) => {
      recordMockEmail(
        {
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
          url: payload.url,
          token: payload.token,
          type: payload.type,
        },
        config,
      );
      return Promise.resolve();
    },
  };
}
