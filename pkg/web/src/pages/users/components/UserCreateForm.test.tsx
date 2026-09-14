import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/dialog.js';
import { UserCreateForm } from './UserCreateForm.js';

describe('UserCreateForm', () => {
  it('offers the shared-device setting to role managers', () => {
    const html = render({ canSetRole: true });

    expect(html).toContain('Shared device');
  });

  it('keeps the shared-device setting away from users who cannot set roles', () => {
    const html = render({ canSetRole: false });

    expect(html).not.toContain('Shared device');
  });

  it('offers only the role slot of the business it stands in, defaulting to that business', () => {
    const equipment = render({ business: 'equipment' });
    const contracting = render({ business: 'contracting' });

    expect(equipment).toContain('Equipment role');
    expect(equipment).not.toContain('Contracting role');
    expect(equipment).toContain('Sales');
    expect(contracting).toContain('Contracting role');
    expect(contracting).not.toContain('Equipment role');
    expect(contracting).toContain('Foreman');
  });
});

function render({
  business = 'equipment',
  canSetRole = true,
}: Partial<Pick<React.ComponentProps<typeof UserCreateForm>, 'business' | 'canSetRole'>>) {
  return renderToStaticMarkup(
    <Dialog>
      <UserCreateForm
        business={business}
        canSetRole={canSetRole}
        extraFields={null}
        isPending={false}
        onSubmit={vi.fn()}
      />
    </Dialog>,
  );
}
