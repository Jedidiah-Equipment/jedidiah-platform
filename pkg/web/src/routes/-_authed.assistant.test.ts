import { describe, expect, it } from 'vitest';

import { AssistantRouteSearch } from './_authed.assistant.js';

describe('AssistantRouteSearch', () => {
  it('accepts an optional prompt and new-chat flag', () => {
    expect(AssistantRouteSearch.parse({ newChat: '1', prompt: 'Draft email' })).toEqual({
      newChat: true,
      prompt: 'Draft email',
    });
    expect(AssistantRouteSearch.parse({ newChat: true, prompt: 'Draft email' })).toEqual({
      newChat: true,
      prompt: 'Draft email',
    });
    expect(AssistantRouteSearch.parse({ newChat: 1, prompt: 'Draft email' })).toEqual({
      newChat: true,
      prompt: 'Draft email',
    });
  });

  it('omits newChat when it is absent', () => {
    expect(AssistantRouteSearch.parse({ prompt: 'Draft email' })).toEqual({
      newChat: undefined,
      prompt: 'Draft email',
    });
  });
});
