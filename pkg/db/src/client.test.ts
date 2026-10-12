import { expect, it } from 'vitest';

import { db } from './client.js';

it('refuses the default client under Vitest so no test holds a session on the template', () => {
  expect(() => db.select).toThrow('The default database client is unavailable under Vitest');
});
