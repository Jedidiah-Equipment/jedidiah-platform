import { APP_ROLES } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserRoleMenuItemContent } from './UserRoleMenu.js';

describe('UserRoleMenuItemContent', () => {
  it('renders Bay Operator as a selectable role option with no sign-in permissions', () => {
    const html = renderToStaticMarkup(<UserRoleMenuItemContent appRole="bay-operator" />);

    expect(APP_ROLES).toContain('bay-operator');
    expect(html).toContain('Bay Operator');
    expect(html).toContain('No sign-in permissions');
  });
});
