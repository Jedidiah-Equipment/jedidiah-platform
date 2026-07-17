import { QuoteLinkedJob } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { getQuoteCancellationDialogCopy, QuoteCancellationAction } from './QuoteCancellationAction.js';

const job = QuoteLinkedJob.parse({
  jobCode: 'JOB-01042',
  jobDescription: 'Feed mixer build',
  jobId: '00000000-0000-4000-8000-000000001042',
});

describe('QuoteCancellationAction', () => {
  it('renders only for a cancellable locked Quote and administrator access', () => {
    const visible = renderToStaticMarkup(
      <QuoteCancellationAction
        canCancel
        isPending={false}
        job={job}
        kind="product"
        onConfirm={vi.fn()}
        status="accepted"
      />,
    );
    const noPermission = renderToStaticMarkup(
      <QuoteCancellationAction
        canCancel={false}
        isPending={false}
        job={job}
        kind="product"
        onConfirm={vi.fn()}
        status="accepted"
      />,
    );
    const unlocked = renderToStaticMarkup(
      <QuoteCancellationAction
        canCancel
        isPending={false}
        job={null}
        kind="product"
        onConfirm={vi.fn()}
        status="sent"
      />,
    );
    const alreadyCancelled = renderToStaticMarkup(
      <QuoteCancellationAction
        canCancel
        isPending={false}
        job={null}
        kind="custom"
        onConfirm={vi.fn()}
        status="cancelled"
      />,
    );

    expect(visible).toContain('Cancel Quote and Job');
    expect(noPermission).toBe('');
    expect(unlocked).toBe('');
    expect(alreadyCancelled).toBe('');
  });

  it('names the Job and consequences, or describes a Quote-only cancellation', () => {
    expect(getQuoteCancellationDialogCopy(job)).toMatchObject({
      confirmLabel: 'Cancel Quote and Job',
      description:
        'This permanently cancels the quote and Job JOB-01042 (Feed mixer build). Future slots are removed from bay schedules; past work stays on record. This cannot be undone.',
      triggerLabel: 'Cancel Quote and Job',
    });
    expect(getQuoteCancellationDialogCopy(null)).toMatchObject({
      confirmLabel: 'Cancel Quote',
      description: 'This permanently cancels the quote. This cannot be undone.',
      triggerLabel: 'Cancel Quote',
    });
  });
});
