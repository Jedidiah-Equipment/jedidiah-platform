import { QuoteCode, UUID } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';

import { JobQuoteCode } from './JobQuoteCode.js';

test('links the Job Sheet Quote code back to the Quote form', async () => {
  const html = await renderWithRouter(
    <JobQuoteCode
      canOpenQuote
      quoteCode={QuoteCode.parse('QUO-00033')}
      quoteId={UUID.parse('550e8400-e29b-41d4-a716-446655440000')}
    />,
  );

  expect(html).toContain('href="/quotes/550e8400-e29b-41d4-a716-446655440000/edit"');
  expect(html).toContain('QUO-00033');
});

test('leaves a Stock Build without a Quote link', () => {
  const html = renderToStaticMarkup(<JobQuoteCode canOpenQuote quoteCode={null} quoteId={null} />);

  expect(html).toBe('Stock Build');
});

test('leaves the Quote code as text when the user cannot open Quotes', () => {
  const html = renderToStaticMarkup(
    <JobQuoteCode
      canOpenQuote={false}
      quoteCode={QuoteCode.parse('QUO-00033')}
      quoteId={UUID.parse('550e8400-e29b-41d4-a716-446655440000')}
    />,
  );

  expect(html).toBe('QUO-00033');
});
