import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Report reader',
    email: 'report-reader@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { db };
});

function contractingSession(role: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = role;
  return session;
}

const window = { kind: 'month', year: 2026, period: 6 } as const;

test('lets every role that reads all Jobs read the Utilisation report, and nobody else', async ({ context }) => {
  for (const session of [
    mockSession('admin'),
    ...(['foreman', 'contracting-invoicing', 'driver', 'mechanic'] as const).map(contractingSession),
  ]) {
    const reports = context.createCaller(session).contractingReports;
    await expect(reports.utilisation(window)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reports.utilisationTrend({ window, subject: { kind: 'fleet' } })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  }
  for (const session of [
    ...(['contracting-admin', 'contracting-manager', 'workshop-manager'] as const).map(contractingSession),
    mockSession('super-admin'),
  ]) {
    const reports = context.createCaller(session).contractingReports;
    expect((await reports.utilisation(window)).window).toMatchObject({ start: '2026-06-01', end: '2026-06-30' });
    expect((await reports.utilisationTrend({ window, subject: { kind: 'fleet' } })).months).toHaveLength(12);
  }
  await expect(
    context.createCaller(contractingSession('contracting-manager')).contractingReports.utilisationTrend({
      window,
      subject: { kind: 'machine', id: '00000000-0000-4000-8000-000000000000' },
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', appCode: 'report.not_found' });
});
