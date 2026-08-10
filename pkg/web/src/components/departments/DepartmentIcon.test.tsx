import { DEPARTMENTS } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DepartmentIcon } from './DepartmentIcon.js';

describe('DepartmentIcon', () => {
  it('renders an icon for every Department', () => {
    for (const department of DEPARTMENTS) {
      expect(renderToStaticMarkup(<DepartmentIcon department={department} />)).toContain('<svg');
    }
  });
});
