import { APP_ROLES } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserRoleMenuItemContent } from './UserRoleMenu.js';

describe('UserRoleMenuItemContent', () => {
  it('renders the role label and description without permission badges', () => {
    const html = renderToStaticMarkup(<UserRoleMenuItemContent appRole="job-viewer" />);

    expect(APP_ROLES).toContain('job-viewer');
    expect(html).toContain('Job Viewer');
    expect(html).toContain('Read-only access to production Jobs.');
    expect(html).not.toContain('View jobs');
    expect(html).not.toContain('View product units');
  });

  it('keeps sign-in eligibility in the Bay Operator description', () => {
    const html = renderToStaticMarkup(<UserRoleMenuItemContent appRole="bay-operator" />);

    expect(APP_ROLES).toContain('bay-operator');
    expect(html).toContain('Bay Operator');
    expect(html).toContain('this role is not enabled for sign-in.');
    expect(html).not.toContain('No sign-in permissions');
  });
});
