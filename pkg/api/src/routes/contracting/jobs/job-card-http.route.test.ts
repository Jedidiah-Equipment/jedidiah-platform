import { createCustomer, createFarm, createJob, createWorkType } from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import type { ContractingRole } from '@pkg/schema';
import type { JobCardModel } from '@pkg/schema/contracting';
import Fastify from 'fastify';
import { expect, vi } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { registerJobCardHttpRoutes } from './job-card-http.route.js';

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../../../auth/session.js', async (original) => ({
  ...(await original<typeof import('../../../auth/session.js')>()),
  getSessionFromHeaders: async () => state.session,
}));

function signIn(role: ContractingRole | null) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  state.session = role === null ? null : session;
}

const test = createTester(async ({ db, auth }) => {
  const actorUserId = 'test-user-id';
  const now = new Date();
  await db.insert(user).values({
    id: actorUserId,
    name: 'Henk',
    email: 'job-card-http@example.com',
    emailVerified: true,
    contractingRole: 'contracting-manager',
    createdAt: now,
    updatedAt: now,
  });
  const customer = await createCustomer({ db, actorUserId, input: { name: 'Rowley' } });
  const farm = await createFarm({ db, actorUserId, input: { customerId: customer.id, name: 'Rooikraal' } });
  const workType = await createWorkType({ db, actorUserId, input: { name: 'Dam building' } });
  const job = async (status: 'active' | 'completed') => {
    const created = await createJob({
      db,
      actorUserId,
      input: {
        customerId: customer.id,
        farmId: farm.id,
        workTypeId: workType.id,
        description: null,
        foremanUserId: null,
      },
    });
    const completion = {
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      completedAt: now,
      completedByUserId: actorUserId,
    };
    await db
      .update(contractingJobs)
      .set(status === 'completed' ? { status, ...completion } : { status })
      .where(eq(contractingJobs.id, created.id));
    return created.jobNumber;
  };
  const documents: JobCardModel[] = [];
  const app = Fastify();
  app.decorate('auth', auth);
  await registerJobCardHttpRoutes(app, {
    db,
    pdfRenderer: async ({ document }) => {
      documents.push(document);
      return new TextEncoder().encode('%PDF-1.7');
    },
  });
  return { app, activeJob: await job('active'), completedJob: await job('completed'), documents };
});

const open = (context: { app: ReturnType<typeof Fastify> }, jobNumber: string, query = '') =>
  context.app.inject({ method: 'GET', url: `/api/contracting/jobs/${jobNumber}/job-card${query}` });

test('streams the customer copy inline to every role that reads Job money', async ({ context }) => {
  for (const role of ['contracting-manager', 'contracting-admin', 'contracting-invoicing'] as const) {
    signIn(role);
    const response = await open(context, context.completedJob);

    expect(response.statusCode, role).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain(
      `inline; filename="${context.completedJob}-job-card-customer.pdf"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toBe('%PDF-1.7');
  }
  expect(context.documents.map((document) => document.variant)).toEqual(['customer', 'customer', 'customer']);
});

test('renders the internal copy on request', async ({ context }) => {
  signIn('contracting-manager');
  const response = await open(context, context.completedJob, '?variant=internal');

  expect(response.statusCode).toBe(200);
  expect(context.documents.at(-1)?.variant).toBe('internal');
});

test('refuses the signed-out, Foremen, an Active Job and an unknown variant', async ({ context }) => {
  signIn(null);
  expect((await open(context, context.completedJob)).statusCode).toBe(401);
  signIn('foreman');
  expect((await open(context, context.completedJob)).statusCode).toBe(403);
  signIn('contracting-manager');
  expect((await open(context, context.activeJob)).statusCode).toBe(409);
  expect((await open(context, context.completedJob, '?variant=draft')).statusCode).toBe(400);
  expect(context.documents).toEqual([]);
});
