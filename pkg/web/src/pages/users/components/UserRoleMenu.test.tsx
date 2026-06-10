import { APP_ROLES } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserRoleMenuItemContent } from './UserRoleMenu.js';

describe('UserRoleMenuItemContent', () => {
  it('renders Job Viewer as a selectable role option with read-only job access', () => {
    const html = renderToStaticMarkup(<UserRoleMenuItemContent appRole="job-viewer" />);

    expect(APP_ROLES).toContain('job-viewer');
    expect(html).toContain('Job Viewer');
    expect(html).toContain('View jobs');
  });
});
