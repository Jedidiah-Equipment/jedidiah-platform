import { describe, expect, it, vi } from 'vitest';

import { buildQuoteEmailPrompt, openQuoteEmailAssistant } from './quote-email-assistant.js';

type OpenQuoteEmailAssistantOptions = Parameters<typeof openQuoteEmailAssistant>[0];

const QUOTE = {
  code: 'QUO-00042',
  id: '550e8400-e29b-41d4-a716-446655440000',
};

describe('buildQuoteEmailPrompt', () => {
  it('builds an editable quote email prompt with the quote identifiers', () => {
    const prompt = buildQuoteEmailPrompt(QUOTE);

    expect(prompt).toContain(QUOTE.code);
    expect(prompt).toContain(QUOTE.id);
    expect(prompt).toContain('customer email body');
    expect(prompt).toContain('real salesperson');
    expect(prompt).toContain('Return only the email body');
  });
});

describe('openQuoteEmailAssistant', () => {
  it('flushes autosave before navigating to a new assistant chat', async () => {
    const events: string[] = [];
    const flushAutosave = vi.fn(async () => {
      events.push('flush');
      return true;
    });
    const navigate = vi.fn<OpenQuoteEmailAssistantOptions['navigate']>(async () => {
      events.push('navigate');
    });

    await expect(openQuoteEmailAssistant({ flushAutosave, navigate, quote: QUOTE })).resolves.toBe(true);

    expect(events).toEqual(['flush', 'navigate']);
    expect(navigate).toHaveBeenCalledWith({
      search: {
        newChat: true,
      },
      state: expect.any(Function),
      to: '/assistant',
    });

    const navigateOptions = navigate.mock.calls[0]?.[0];
    expect(typeof navigateOptions?.state).toBe('function');

    if (typeof navigateOptions?.state !== 'function') {
      throw new Error('Expected quote email navigation to use history state.');
    }

    expect(navigateOptions.state({ __TSR_index: 1, key: 'history-entry' })).toEqual({
      __TSR_index: 1,
      key: 'history-entry',
      assistantDraftPrompt: buildQuoteEmailPrompt(QUOTE),
    });
  });

  it('does not navigate when autosave cannot flush', async () => {
    const flushAutosave = vi.fn(async () => false);
    const navigate = vi.fn();

    await expect(openQuoteEmailAssistant({ flushAutosave, navigate, quote: QUOTE })).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
  });
});
