import fastifyMultipart from '@fastify/multipart';
import type { Db } from '@pkg/db';
import { parts, supplier, user } from '@pkg/db';
import type { PartLabelPdfModel, PartLabelPdfRenderer } from '@pkg/schema';
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

vi.mock('../../auth/session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/session.js')>();
  return { ...actual, getSessionFromHeaders: vi.fn(async () => routeTestState.session) };
});

const test = createTester(async ({ db }) => {
  routeTestState.db = db;
  routeTestState.session = mockSession();
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [partSupplier] = await db.insert(supplier).values({ companyName: 'Label Supplier' }).returning();
  if (!partSupplier) throw new Error('Supplier fixture was not created');
  const created = await db
    .insert(parts)
    .values([
      partRow(partSupplier.id, 'P-200', 'Second bearing', 'Bearings', 'Bin B-02'),
      partRow(partSupplier.id, 'P-100', 'Main bearing', 'Bearings', 'Bin A-04'),
      partRow(partSupplier.id, 'T-100', 'Hydraulic tube', 'Tube', 'Bin A-04'),
      partRow(partSupplier.id, 'N-100', 'Loose nut', 'Fasteners', null),
    ])
    .returning({ code: parts.code, id: parts.id });

  return { db, ids: new Map(created.map((part) => [part.code, part.id])) };
});

const openApps: FastifyInstance[] = [];

beforeEach(() => {
  routeTestState.session = mockSession();
});

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('Part label HTTP routes', () => {
  test('streams one label for the requested Part', async ({ context }) => {
    const rendered: PartLabelPdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));
    const response = await app.inject(`/api/parts/${context.ids.get('P-100')}/label`);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['content-disposition']).toContain('P-100-label.pdf');
    expect(rendered).toEqual([[{ code: 'P-100', name: 'Main bearing', storageLocation: 'Bin A-04' }]]);
  });

  test('streams deterministic batches for all, category, location, and explicit Part selections', async ({
    context,
  }) => {
    const rendered: PartLabelPdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));

    for (const url of [
      '/api/parts/labels?selection=all',
      '/api/parts/labels?selection=category&category=Bearings',
      '/api/parts/labels?selection=storageLocation&storageLocation=Bin%20A-04',
      `/api/parts/labels?selection=ids&ids=${context.ids.get('T-100')},${context.ids.get('N-100')}`,
    ]) {
      const response = await app.inject(url);
      expect(response.statusCode, response.body).toBe(200);
    }

    expect(rendered.map((labels) => labels.map((label) => label.code))).toEqual([
      ['N-100', 'P-100', 'P-200', 'T-100'],
      ['P-100', 'P-200'],
      ['P-100', 'T-100'],
      ['N-100', 'T-100'],
    ]);
  });

  test('repeats explicitly selected Part labels by their requested copy counts', async ({ context }) => {
    const rendered: PartLabelPdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));
    const firstId = context.ids.get('P-100');
    const secondId = context.ids.get('T-100');

    const response = await app.inject(`/api/parts/labels?selection=ids&ids=${firstId},${secondId}&copies=2,3`);

    expect(response.statusCode, response.body).toBe(200);
    expect(rendered.map((labels) => labels.map((label) => label.code))).toEqual([
      ['P-100', 'P-100', 'T-100', 'T-100', 'T-100'],
    ]);
  });

  test('requires part or inventory read access before rendering labels', async ({ context }) => {
    const rendered: PartLabelPdfModel[][] = [];
    const app = await createApp(capturingRenderer(rendered));

    routeTestState.session = null;
    const unauthenticated = await app.inject(`/api/parts/${context.ids.get('P-100')}/label`);
    routeTestState.session = mockSession('job-viewer');
    const forbidden = await app.inject('/api/parts/labels?selection=all');

    expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
    expect(forbidden.statusCode, forbidden.body).toBe(403);
    expect(rendered).toEqual([]);

    // A label carries no cost, so the price-blind stores role prints what it just received (spec §10).
    routeTestState.session = mockSession('stores');
    const stores = await app.inject(`/api/parts/${context.ids.get('P-100')}/label`);

    expect(stores.statusCode, stores.body).toBe(200);
    expect(rendered).toHaveLength(1);
  });

  test('returns not found for a missing Part and for an empty batch', async ({ context }) => {
    void context;
    const app = await createApp(capturingRenderer([]));

    const missing = await app.inject('/api/parts/00000000-0000-4000-8000-000000000999/label');
    const emptyBatch = await app.inject('/api/parts/labels?selection=category&category=Does%20not%20exist');

    expect(missing.statusCode, missing.body).toBe(404);
    expect(emptyBatch.statusCode, emptyBatch.body).toBe(404);
  });
});

async function createApp(pdfRenderer: PartLabelPdfRenderer) {
  const { registerPartLabelHttpRoutes } = await import('./part-label-http.route.js');
  const app = Fastify();
  await app.register(fastifyMultipart);
  await registerPartLabelHttpRoutes(app, { pdfRenderer });
  await app.ready();
  openApps.push(app);
  return app;
}

function capturingRenderer(rendered: PartLabelPdfModel[][]): PartLabelPdfRenderer {
  return async ({ document }) => {
    rendered.push(document);
    return new TextEncoder().encode('%PDF-label');
  };
}

function partRow(supplierId: string, code: string, name: string, category: string, storageLocation: string | null) {
  return {
    category,
    code,
    description: `${name} description`,
    drawingCode: null,
    finish: 'Plain',
    isInternallyFabricated: false,
    name,
    storageLocation,
    supplierCode: `SUP-${code}`,
    supplierId,
    unitOfMeasure: 'piece' as const,
  };
}
