import { randomBytes } from 'node:crypto';
import { user } from '@pkg/db';
import { JohnDeereClient, JohnDeereConnectionService } from '@pkg/integrations/contracting';
import Fastify from 'fastify';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import {
  JOHN_DEERE_CALLBACK_PATH,
  johnDeereCallbackUris,
  registerJohnDeereHttpRoutes,
} from './john-deere-http.route.js';

const uris = johnDeereCallbackUris('https://api.example');
const tab = (result: string) => `https://app.example/contracting/settings?tab=john-deere&result=${result}`;

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'jd-admin',
    name: 'Jed Botha',
    email: 'jd-callback@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const deere = { organizationConnected: true, organizationReads: 0 };
  const client = new JohnDeereClient({
    platformBaseUrl: 'https://api.example/platform',
    equipmentBaseUrl: 'https://equipment.example/isg',
    issuer: 'https://signin.example/oauth2/aus',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    now: () => new Date(),
    fetch: async (input) => {
      if (String(input).endsWith('/v1/token'))
        return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 43_200 });
      deere.organizationReads += 1;
      const rel = deere.organizationConnected ? 'manage_connections' : 'connections';
      return Response.json({
        values: [
          { id: '4321', name: 'Jedidiah Boerdery', links: [{ rel, uri: 'https://connections.example/select' }] },
        ],
      });
    },
  });
  const connection = new JohnDeereConnectionService({
    db,
    client,
    tokenKey: randomBytes(32),
    ...uris,
    now: () => new Date(),
  });
  const app = Fastify();
  await registerJohnDeereHttpRoutes(app, { connection, appBaseUrl: 'https://app.example', secureCookie: true });
  const start = async () =>
    new URL((await connection.startConnect({ actorUserId: 'jd-admin' })).url).searchParams.get('state') ?? '';
  const get = (query: string, cookie?: string) =>
    app.inject({ method: 'GET', url: `${JOHN_DEERE_CALLBACK_PATH}${query}`, headers: cookie ? { cookie } : {} });
  const returnFromSignIn = (state: string) => get(`?code=the-code&state=${encodeURIComponent(state)}`);
  return { deere, start, get, returnFromSignIn };
});

test('lands back on the tab as connected when the organization already granted access', async ({ context }) => {
  const state = await context.start();
  const reply = await context.returnFromSignIn(state);
  expect(reply.statusCode).toBe(302);
  expect(reply.headers.location).toBe(tab('connected'));
});

test('sends the browser through the organization picker once, admitting its return by cookie', async ({ context }) => {
  context.deere.organizationConnected = false;
  const state = await context.start();

  const first = await context.returnFromSignIn(state);
  expect(first.headers.location).toBe(
    `https://connections.example/select?redirect_uri=${encodeURIComponent(uris.connectionsReturnUri)}`,
  );
  const setCookie = String(first.headers['set-cookie']);
  expect(setCookie).toMatch(/^jd_connect_return=return%3A[0-9a-f]{32}; /);
  expect(setCookie).toContain(`Path=${JOHN_DEERE_CALLBACK_PATH}; Max-Age=600; HttpOnly; SameSite=Lax; Secure`);

  // Without the cookie a return is refused; with it, still unconnected, back to the tab and never to Deere again.
  expect((await context.get('?connections=done')).headers.location).toBe(tab('error'));
  const back = await context.get('?connections=done', setCookie.split(';')[0]);
  expect(back.headers.location).toBe(tab('not-connected'));
  expect(String(back.headers['set-cookie'])).toContain('Max-Age=0');
  expect(context.deere.organizationReads).toBe(2);
});

test('answers a forged state, a stray return and a declined sign-in with an error', async ({ context }) => {
  await context.start();
  expect((await context.get('?code=the-code&state=connect:forged')).headers.location).toBe(tab('error'));
  expect((await context.get('?connections=done', 'jd_connect_return=return%3Aforged')).headers.location).toBe(
    tab('error'),
  );
  expect((await context.get('?error=access_denied&state=x')).headers.location).toBe(tab('error'));
  expect(context.deere.organizationReads).toBe(0);
});
