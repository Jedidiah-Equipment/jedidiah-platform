import type { JohnDeereConnectionService } from '@pkg/integrations/contracting';
import type { JohnDeereConnectionStatus, JohnDeereConnectResult } from '@pkg/schema/contracting';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { log } from '../../../logger.js';
import { serializeError } from '../../../trpc/errors.js';

export const JOHN_DEERE_CALLBACK_PATH = '/api/contracting/john-deere/callback';

/** The callback's two addresses: the OAuth redirect, and where Deere's organization picker returns to. */
export function johnDeereCallbackUris(apiBaseUrl: string) {
  const redirectUri = new URL(JOHN_DEERE_CALLBACK_PATH, apiBaseUrl);
  const connectionsReturnUri = new URL(redirectUri);
  connectionsReturnUri.searchParams.set('connections', 'done');
  return { redirectUri: redirectUri.toString(), connectionsReturnUri: connectionsReturnUri.toString() };
}

const CallbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  connections: z.literal('done').optional(),
});

const resultOf = (status: JohnDeereConnectionStatus): JohnDeereConnectResult =>
  status === 'connected' ? 'connected' : 'not-connected';

/**
 * Deere's OAuth callback. No session: the browser arrives from Deere, and the open round trip's `state` is
 * the credential. Sends the browser through Deere's organization picker at most once, because Deere warns
 * against redirect loops, then back to the John Deere tab with the outcome.
 */
export async function registerJohnDeereHttpRoutes(
  app: FastifyInstance,
  { connection, appBaseUrl }: { connection: JohnDeereConnectionService; appBaseUrl: string },
) {
  const backToTab = (result: JohnDeereConnectResult) => {
    const url = new URL('/contracting/settings', appBaseUrl);
    url.search = new URLSearchParams({ tab: 'john-deere', result }).toString();
    return url.toString();
  };

  app.get(JOHN_DEERE_CALLBACK_PATH, async (request, reply) => {
    try {
      const query = CallbackQuery.parse(request.query);
      if (query.code && query.state) {
        const { status, connectionsUrl } = await connection.completeConnect({ code: query.code, state: query.state });
        return reply.redirect(connectionsUrl ?? backToTab(resultOf(status)));
      }
      if (query.connections === 'done') {
        const { status } = await connection.finishConnect();
        return reply.redirect(backToTab(resultOf(status)));
      }
      // Deere sends `error` instead of a code when the owner declines.
      return reply.redirect(backToTab('error'));
    } catch (error) {
      log.service.warn({ error: serializeError(error) }, 'John Deere connect failed');
      return reply.redirect(backToTab('error'));
    }
  });
}
