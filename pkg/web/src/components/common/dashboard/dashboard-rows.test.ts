import { expect, it } from 'vitest';

import { dashboardRowColumns } from './dashboard-rows.js';

it('sizes each row from the widgets a role sees, so no row leaves a gap', () => {
  expect(dashboardRowColumns([{ size: 'xs' }, { size: 'xs' }, { size: 'md' }])).toBe(
    'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr)',
  );
  expect(dashboardRowColumns([{ size: 'xs' }, { size: 'xs' }])).toBe('minmax(0, 1fr) minmax(0, 1fr)');
});
