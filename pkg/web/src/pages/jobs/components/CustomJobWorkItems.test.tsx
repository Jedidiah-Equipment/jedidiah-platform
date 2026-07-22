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
              id: '00000000-0000-4000-8000-000000000101',
              name: 'Strip pump assembly',
            },
            {
              id: '00000000-0000-4000-8000-000000000102',
              name: 'Install replacement pump',
            },
          ],
        }}
      />,
    );

    expect(html.indexOf('Strip pump assembly')).toBeLessThan(html.indexOf('Install replacement pump'));
  });

  it('leaves product Job sheets unchanged', () => {
    expect(
      renderToStaticMarkup(
        <CustomJobWorkItems
          job={{
            quoteKind: 'product',
            workRows: [],
          }}
        />,
      ),
    ).toBe('');
  });
});
