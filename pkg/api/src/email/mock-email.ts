import type { ApiConfig } from '../env.js';
import type { EmailType } from './email-sender.js';

export type MockEmailType = EmailType;

export interface MockEmailMessage {
  to: string;
  subject: string;
  text: string;
  url?: string;
  token?: string;
  type: MockEmailType;
  attachmentFilenames: string[];
}

const messages: MockEmailMessage[] = [];

export function getMockEmailMessages(): MockEmailMessage[] {
  return [...messages];
}

export function clearMockEmailMessages(): void {
  messages.length = 0;
}

export function recordMockEmail(message: MockEmailMessage, config: Pick<ApiConfig, 'NODE_ENV'>): void {
  messages.push(message);

  if (config.NODE_ENV === 'development') {
    const detail = message.url ?? message.attachmentFilenames.join(', ') ?? '';
    console.info(`[mock-email] ${message.type} to ${message.to}: ${detail}`);
  }
}
