import type { JobDetail } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CustomJobWorkItems } from './CustomJobWorkItems.js';

describe('CustomJobWorkItems', () => {
  it('renders custom Work Item names in order without internal details', () => {
    const html = renderToStaticMarkup(
      <CustomJobWorkItems
        job={{
          quoteKind: 'custom',
          workRows: [
            {
              hours: '1.5 hours',
              hourlyRate: 'R 850.00/hour',
              id: '00000000-0000-4000-8000-000000000101',
              name: 'Strip pump assembly',
              parts: ['Internal seal kit'],
            },
            {
              id: '00000000-0000-4000-8000-000000000102',
              name: 'Install replacement pump',
            },
          ] as unknown as JobDetail['workRows'],
        }}
      />,
    );

    expect(html.indexOf('Strip pump assembly')).toBeLessThan(html.indexOf('Install replacement pump'));
    expect(html).not.toContain('1.5 hours');
    expect(html).not.toContain('R 850.00/hour');
    expect(html).not.toContain('Internal seal kit');
  });

  it('leaves product Job sheets unchanged', () => {
    expect(
      renderToStaticMarkup(
        <CustomJobWorkItems
          job={{
            quoteKind: 'product',
            workRows: [{ id: '00000000-0000-4000-8000-000000000101', name: 'Existing product quote line item' }],
          }}
        />,
      ),
    ).toBe('');
  });
});
