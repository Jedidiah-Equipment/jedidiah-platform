import type { ApiConfig } from '../env.js';

export type MockEmailType = 'email-verification' | 'password-reset';

export interface MockEmailMessage {
  to: string;
  subject: string;
  text: string;
  url: string;
  token: string;
  type: MockEmailType;
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
    console.info(`[mock-email] ${message.type} to ${message.to}: ${message.url}`);
  }
}
