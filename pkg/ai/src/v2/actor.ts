import type { AuthId } from '@pkg/schema';

import type { AiV2Context } from './context.js';

export function requireAiV2ActorId(ctx: AiV2Context): AuthId {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session.user.id;
}
