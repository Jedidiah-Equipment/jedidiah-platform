import {
  createDatabaseClient,
  createEphemeralTestDatabase,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
  products,
  user,
} from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { completeJobStage, createJob, startJobStage } from './job-service.js';

describe('job pipeline service', () => {
  it('derives stage state and job lifecycle from actual dates during start/stop', async () => {
    await withDatabase(async (db) => {
      await createActorUser(db);
      const productId = await createProduct(db);
      const access = createUserAccessSummary({ role: 'job-supervisor', userId: 'test-user-id' });
      const created = await createJob({
        access,
        actorUserId: 'test-user-id',
        db,
        input: { productId },
      });

      const started = await startJobStage({
        access,
        actorUserId: 'test-user-id',
        db,
        id: created.id,
        stage: 'procurement',
      });

      expect(started.lifecycleStatus).toBe('active');
      expect(started.stages.find((stage) => stage.stage === 'procurement')).toMatchObject({
        actualEnd: null,
        state: 'in-progress',
      });

      const completed = await completeJobStage({
        access,
        actorUserId: 'test-user-id',
        db,
        id: created.id,
        stage: 'procurement',
      });

      expect(completed.lifecycleStatus).toBe('active');
      expect(completed.stages.find((stage) => stage.stage === 'procurement')).toMatchObject({
        state: 'complete',
      });
    });
  });
});

async function withDatabase(action: (db: ReturnType<typeof createDatabaseClient>['db']) => Promise<void>) {
  const templateDatabaseUrl = getTestTemplateDatabaseUrl();
  const { databaseName, databaseUrl } = await createEphemeralTestDatabase({ templateDatabaseUrl });
  const databaseClient = createDatabaseClient(databaseUrl);

  try {
    await action(databaseClient.db);
  } finally {
    await databaseClient.close();
    await dropTestDatabase(databaseName, templateDatabaseUrl);
  }
}

async function createActorUser(db: ReturnType<typeof createDatabaseClient>['db']) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'job-supervisor',
    updatedAt: now,
  });
}

async function createProduct(db: ReturnType<typeof createDatabaseClient>['db']): Promise<string> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      modelCode: 'JOB-PIPELINE-001',
      name: 'Job Pipeline Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product.id;
}
