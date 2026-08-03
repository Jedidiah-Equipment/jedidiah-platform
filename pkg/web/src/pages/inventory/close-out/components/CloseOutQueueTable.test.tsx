import { CloseOutQueueResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Link needs a router context it can't have in a static render; the route target is what matters here, so
// render it as the anchor it becomes.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, to }: { children?: React.ReactNode; params: { jobId: string }; to: string }) => (
    <a href={to.replace('$jobId', params.jobId)}>{children}</a>
  ),
}));

import { CloseOutQueueTable } from './CloseOutQueueTable.js';

describe('CloseOutQueueTable', () => {
  it('reads outstanding stock as Parts and shouts about the stale end of the queue', () => {
    const result = CloseOutQueueResult.parse({
      items: [
        {
          ageDays: 64,
          code: 12,
          committedPartCount: 2,
          completedOn: '2026-06-01',
          displayName: 'Stale rebuild',
          drawnPartCount: 1,
          isStale: true,
          jobId: '00000000-0000-4000-8000-000000000001',
        },
        {
          ageDays: 1,
          code: 13,
          committedPartCount: 0,
          completedOn: '2026-08-03',
          displayName: 'Fresh repair',
          drawnPartCount: 3,
          isStale: false,
          jobId: '00000000-0000-4000-8000-000000000002',
        },
      ],
    });

    const html = renderToStaticMarkup(<CloseOutQueueTable items={result.items} />);

    expect(html).toContain('Parts drawn');
    expect(html).toContain('Parts committed');
    expect(html).toContain('Stale rebuild');
    expect(html).toContain('JOB-00012');
    expect(html).toContain('64 days');
    expect(html).toContain('1 day<');
    // Every row links into the close-out screen, which is the only way a Job leaves the queue.
    expect(html).toContain('/inventory/close-out/00000000-0000-4000-8000-000000000001');
    expect(html).toContain('/inventory/close-out/00000000-0000-4000-8000-000000000002');
  });
});
