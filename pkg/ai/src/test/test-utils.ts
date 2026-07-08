import type { AppRole, Logger } from '@pkg/schema';
import pino from 'pino';

import type { AiSession } from '../context.js';

export function mockSession(_role: AppRole = 'admin'): AiSession {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      assistantEnabled: true,
    },
  };
}

export function createSilentLogger(): Logger {
  const silent = pino({ level: 'silent' });

  return {
    ai: silent,
    http: silent,
    root: silent,
    service: silent,
  };
}
