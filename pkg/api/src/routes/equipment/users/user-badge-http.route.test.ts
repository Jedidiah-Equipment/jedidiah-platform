import fastifyMultipart from '@fastify/multipart';
import type { Db } from '@pkg/db';
import { user } from '@pkg/db';
import type { UserBadgePdfModel, UserBadgePdfRenderer } from '@pkg/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const routeTestState = vi.hoisted(() => ({
  db: null as unknown,
  session: null as unknown,
}));

vi.mock('@pkg/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pkg/db')>();
  const dbProxy = new Proxy({} as Db, {
    get(_target, property) {
      const db = routeTestState.db as Db | null;
      if (!db) throw new Error('Route test database was not initialised');
      const value = db[property as keyof Db];
      return typeof value === 'function' ? value.bind(db) : value;
    },
  });

  return { ...actual, db: dbProxy };
});

vi.mock('../../../auth/session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../auth/session.js')>();
  return { ...actual, getSessionFromHeaders: vi.fn(async () => routeTestState.session) };
});

const test = createTester(async ({ db }) => {
  routeTestState.db = db;
  routeTestState.session = mockSession();
  const now = new Date('2026-08-01T08:00:00.000Z');
  await db.insert(user).values([
    {
      createdAt: now,
      email: 'test@example.com',
      emailVerified: true,
      id: 'test-user-id',
      name: 'Test User',
      role: 'admin',
      updatedAt: now,
    },
    {
      createdAt: now,
      email: 'stores-person@example.com',
      emailVerified: true,
      id: 'stores-person',
      name: 'Thabo Mokoena',
      role: 'stores',
      updatedAt: now,
    },
  ]);

  return { db };
});

const openApps: FastifyInstance[] = [];

beforeEach(() => {
  routeTestState.session = mockSession();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('stores badge HTTP route', () => {
  test('streams the badge card for the requested person', async ({ context }) => {
    void context;
    const rendered: UserBadgePdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));
    const response = await app.inject('/api/users/stores-person/badge');

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['content-disposition']).toContain('stores-person-stores-badge.pdf');
    expect(rendered).toEqual([[{ id: 'stores-person', name: 'Thabo Mokoena' }]]);
  });

  test('lets only a role-setter print a badge', async ({ context }) => {
    void context;
    const rendered: UserBadgePdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));

    routeTestState.session = null;
    const unauthenticated = await app.inject('/api/users/stores-person/badge');
    // The stores role holds no user administration at all, so the tablet cannot print its own cards.
    routeTestState.session = mockSession('stores');
    const forbidden = await app.inject('/api/users/stores-person/badge');

    expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
    expect(forbidden.statusCode, forbidden.body).toBe(403);
    expect(rendered).toEqual([]);
  });

  test('returns not found for a person who does not exist', async ({ context }) => {
    void context;
    const app = await createApp(capturingRenderer([]));
    const response = await app.inject('/api/users/nobody-at-all/badge');

    expect(response.statusCode, response.body).toBe(404);
  });
});

async function createApp(pdfRenderer: UserBadgePdfRenderer) {
  const { registerUserBadgeHttpRoutes } = await import('./user-badge-http.route.js');
  const app = Fastify();
  await app.register(fastifyMultipart);
  await registerUserBadgeHttpRoutes(app, { pdfRenderer });
  await app.ready();
  openApps.push(app);
  return app;
}

function capturingRenderer(rendered: UserBadgePdfModel[][]): UserBadgePdfRenderer {
  return async ({ document }) => {
    rendered.push(document);
    return new TextEncoder().encode('%PDF-badge');
  };
}
