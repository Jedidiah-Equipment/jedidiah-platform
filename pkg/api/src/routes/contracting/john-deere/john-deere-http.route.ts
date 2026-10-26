import type { JohnDeereConnectionService } from '@pkg/integrations/contracting';
import type { JohnDeereConnectResult } from '@pkg/schema/contracting';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { log } from '../../../logger.js';
import { serializeError } from '../../../trpc/errors.js';

export const JOHN_DEERE_CALLBACK_PATH = '/api/contracting/john-deere/callback';
const RETURN_COOKIE = 'jd_connect_return';

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

function returnCookie(request: FastifyRequest): string | null {
  for (const pair of request.headers.cookie?.split(';') ?? []) {
    const [name, ...value] = pair.trim().split('=');
    if (name === RETURN_COOKIE) return decodeURIComponent(value.join('='));
  }
  return null;
}

/**
 * Deere's OAuth callback. No session: the browser arrives from Deere, and the open round trip's `state` is
 * the credential. Deere's organization picker returns with no `state`, so the first leg hands the browser a
 * one-time return token in an HttpOnly cookie and the second leg is admitted only with it. The picker is
 * visited at most once, because Deere warns against redirect loops.
 */
export async function registerJohnDeereHttpRoutes(
  app: FastifyInstance,
  {
    connection,
    appBaseUrl,
    secureCookie,
  }: { connection: JohnDeereConnectionService; appBaseUrl: string; secureCookie: boolean },
) {
  const backToTab = (result: JohnDeereConnectResult) => {
    const url = new URL('/contracting/settings', appBaseUrl);
    url.search = new URLSearchParams({ tab: 'john-deere', result }).toString();
    return url.toString();
  };
  const cookie = (value: string, maxAgeSeconds: number) =>
    [
      `${RETURN_COOKIE}=${encodeURIComponent(value)}`,
      `Path=${JOHN_DEERE_CALLBACK_PATH}`,
      `Max-Age=${maxAgeSeconds}`,
      'HttpOnly',
      'SameSite=Lax',
      ...(secureCookie ? ['Secure'] : []),
    ].join('; ');

  app.get(JOHN_DEERE_CALLBACK_PATH, async (request, reply) => {
    try {
      const query = CallbackQuery.parse(request.query);
      if (query.code && query.state) {
        const { connected, picker } = await connection.completeConnect({ code: query.code, state: query.state });
        if (picker) return reply.header('Set-Cookie', cookie(picker.returnToken, 600)).redirect(picker.url);
        return reply.redirect(backToTab(connected ? 'connected' : 'not-connected'));
      }
      if (query.connections === 'done') {
        reply.header('Set-Cookie', cookie('', 0));
        const { connected } = await connection.finishConnect({ returnToken: returnCookie(request) ?? '' });
        return reply.redirect(backToTab(connected ? 'connected' : 'not-connected'));
      }
      // Deere sends `error` instead of a code when the owner declines.
      return reply.redirect(backToTab('error'));
    } catch (error) {
      log.service.warn({ error: serializeError(error) }, 'John Deere connect failed');
      return reply.redirect(backToTab('error'));
    }
  });
}
