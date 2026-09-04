import { DEPARTMENTS } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DepartmentIcon } from './DepartmentIcon.js';

describe('DepartmentIcon', () => {
  it('renders an icon for every Department', () => {
    for (const department of DEPARTMENTS) {
      expect(renderToStaticMarkup(<DepartmentIcon department={department} />)).toContain('<svg');
    }
  });

  it('uses the hammer as the canonical Fabrication icon', () => {
    expect(renderToStaticMarkup(<DepartmentIcon department="fabrication" />)).toContain('tabler-icon-hammer');
  });
});
