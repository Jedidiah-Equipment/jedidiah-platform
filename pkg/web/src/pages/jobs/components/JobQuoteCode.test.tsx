import { QuoteCode, UUID } from '@pkg/schema';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';

import { JobQuoteCode } from './JobQuoteCode.js';

test('links the Job Sheet Quote code back to the Quote form and closes the sheet', async () => {
  const onOpenQuote = vi.fn();
  const link = JobQuoteCode({
    canOpenQuote: true,
    onOpenQuote,
    quoteCode: QuoteCode.parse('QUO-00033'),
    quoteId: UUID.parse('550e8400-e29b-41d4-a716-446655440000'),
  });
  if (!isValidElement<{ onClick: () => void }>(link)) throw new Error('Expected a Quote link.');

  const html = await renderWithRouter(link);
  link.props.onClick();

  expect(html).toContain('href="/quotes/550e8400-e29b-41d4-a716-446655440000/edit"');
  expect(html).toContain('QUO-00033');
  expect(html).toContain('text-primary');
  expect(html).toContain('tabler-icon-external-link');
  expect(onOpenQuote).toHaveBeenCalledOnce();
});

test('leaves a Stock Build without a Quote link', () => {
  const html = renderToStaticMarkup(
    <JobQuoteCode canOpenQuote onOpenQuote={() => undefined} quoteCode={null} quoteId={null} />,
  );

  expect(html).toBe('Stock Build');
});

test('leaves the Quote code as text when the user cannot open Quotes', () => {
  const html = renderToStaticMarkup(
    <JobQuoteCode
      canOpenQuote={false}
      onOpenQuote={() => undefined}
      quoteCode={QuoteCode.parse('QUO-00033')}
      quoteId={UUID.parse('550e8400-e29b-41d4-a716-446655440000')}
    />,
  );

  expect(html).toBe('QUO-00033');
});
