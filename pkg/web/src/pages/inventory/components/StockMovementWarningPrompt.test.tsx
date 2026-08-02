import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';

describe('StockMovementWarningPrompt', () => {
  it('renders soft checkout warnings and makes the non-blocking action explicit', () => {
    const html = renderToStaticMarkup(
      <StockMovementWarningPrompt warnings={['exceeds-cfo', 'negative-stock-on-hand']} />,
    );

    expect(html).toContain('This draw exceeds the Job CFO');
    expect(html).toContain('This draw will take stock on hand negative');
    expect(html).toContain('You can still post this movement');
  });

  it('renders the over-return warning', () => {
    expect(renderToStaticMarkup(<StockMovementWarningPrompt warnings={['exceeds-drawn']} />)).toContain(
      'This return exceeds the quantity currently drawn',
    );
  });
});
