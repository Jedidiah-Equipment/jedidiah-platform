import { type Db, products } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { describe, expect } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'job-supervisor');
  const product = await createProduct(db);

  return {
    product,
  };
});

describe('jobs.create', () => {
  test('creates a job with the production stage model', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

    const job = await caller.jobs.create({
      productId: context.product.id,
    });

    expect(job.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });
});

async function createProduct(db: Db): Promise<Pick<Product, 'id'>> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'JOB-TEST',
      name: 'Job Test Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}
