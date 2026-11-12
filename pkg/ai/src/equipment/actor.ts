import type { AuthId, UserAccessSummary } from '@pkg/schema';

import type { AiContext } from './context.js';

export function requireAiActorId(ctx: AiContext): AuthId {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session.user.id;
}

/** The access summary a Quote read or write judges by, with the same authenticated-user requirement. */
export function requireAiActor(ctx: AiContext): UserAccessSummary {
  if (!ctx.access) {
    throw new Error('AI tools that read Quote Actions require an authenticated user.');
  }

  return ctx.access;
}
