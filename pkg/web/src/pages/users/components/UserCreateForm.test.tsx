import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/dialog.js';
import { UserCreateForm } from './UserCreateForm.js';

describe('UserCreateForm', () => {
  it('offers the shared-device setting to role managers', () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <UserCreateForm canAssignDepartments canSetRole isPending={false} onSubmit={vi.fn()} />
      </Dialog>,
    );

    expect(html).toContain('Shared device');
  });

  it('keeps the shared-device setting away from users who cannot set roles', () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <UserCreateForm canAssignDepartments canSetRole={false} isPending={false} onSubmit={vi.fn()} />
      </Dialog>,
    );

    expect(html).not.toContain('Shared device');
  });
});
