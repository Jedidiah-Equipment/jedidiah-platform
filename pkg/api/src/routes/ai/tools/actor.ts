import type { AiContext } from '../ai-context.js';

/**
 * Resolves the authenticated actor session for AI write tools. Write tools must never run without a
 * signed-in user, so this guards the invariant once instead of each tool re-checking it.
 */
export function requireActorSession(ctx: AiContext): NonNullable<AiContext['session']> {
  if (!ctx.session) {
    throw new Error('AI write tools require an authenticated user.');
  }

  return ctx.session;
}
