import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserNameCell } from './UserTable.js';

describe('UserNameCell', () => {
  it('keeps the device marker on the same small footprint as user thumbnails', () => {
    const html = renderToStaticMarkup(
      <UserNameCell isCurrentUser={false} isDevice name="Stores Tablet" thumbnailDataUrl={null} />,
    );

    expect(html).toContain('size-6');
    expect(html).toContain('width="14"');
    expect(html).toContain('height="14"');
  });
});
