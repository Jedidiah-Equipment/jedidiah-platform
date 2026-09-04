import type { AuthId } from '@pkg/schema';

import type { AiContext } from './context.js';

export function requireAiActorId(ctx: AiContext): AuthId {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session.user.id;
}
