import type { AppRole } from '@pkg/schema';

import type { AiSession } from '../context.js';

export function mockSession(_role: AppRole = 'admin'): AiSession {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
    },
  };
}
