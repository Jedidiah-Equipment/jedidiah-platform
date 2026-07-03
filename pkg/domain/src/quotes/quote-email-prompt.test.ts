import { describe, expect, it } from 'vitest';

import { buildQuoteEmailPrompt } from './quote-email-prompt.js';

describe('buildQuoteEmailPrompt', () => {
  it('asks the assistant to look the quote up by id', () => {
    const prompt = buildQuoteEmailPrompt({
      code: 'QUO-00042',
      quoteId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(prompt).toContain('QUO-00042');
    expect(prompt).toContain('Use the available quote details for quote id 550e8400-e29b-41d4-a716-446655440000.');
    expect(prompt).toContain('customer email body');
    expect(prompt).toContain('real salesperson');
    expect(prompt).toContain(
      'For Custom Quotes, describe the quoted work by its Work Title instead of naming a Product',
    );
    expect(prompt).toContain('Return only the email body');
  });
});
