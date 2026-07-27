import { afterAll } from 'vitest';

import { dropTrackedTestDatabases } from './test-utils.js';

afterAll(async () => {
  await dropTrackedTestDatabases();
});
