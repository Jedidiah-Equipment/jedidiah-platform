import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AuditChangesContent } from './AuditTable.js';

describe('AuditChangesContent', () => {
  it('constrains unbroken image data inside the change details layout', () => {
    const dataUrl = `data:image/webp;base64,${'A'.repeat(200)}`;
    const html = renderToStaticMarkup(
      <AuditChangesContent
        changes={{
          thumbnailDataUrl: {
            from: null,
            to: dataUrl,
          },
        }}
      />,
    );

    expect(html).toContain('Thumbnail data url');
    expect(html).toContain(dataUrl);
    expect(html).toMatch(/data-slot="scroll-area" class="[^"]*min-w-0/);
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*" data-slot="audit-changes-content"/);
    expect(html.match(/class="[^"]*wrap-anywhere[^"]*" data-slot="audit-change-value"/g)).toHaveLength(2);
    expect(html).toMatch(/class="[^"]*wrap-anywhere[^"]*" data-slot="audit-changes-raw-json"/);
  });
});
