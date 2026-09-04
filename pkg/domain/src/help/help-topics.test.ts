import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, helpUrl } from './help-topics.js';

describe('HELP_TOPICS', () => {
  it('gives every app area a docs path', () => {
    for (const path of Object.values(HELP_TOPICS)) {
      expect(path).toMatch(/^\//);
    }
  });

  it('always covers the docs landing page', () => {
    expect(HELP_TOPICS.home).toBe('/');
  });

  it('sends Product Help to the Product cost estimate procedure', () => {
    expect(HELP_TOPICS.products).toBe('/inventory/maintain-a-product-cost-estimate');
  });
});

describe('helpUrl', () => {
  it('joins the docs origin to the topic path', () => {
    expect(helpUrl('https://docs.example.com', 'home')).toBe('https://docs.example.com/');
  });

  it('does not double the slash when the origin carries a trailing one', () => {
    expect(helpUrl('https://docs.example.com/', 'home')).toBe('https://docs.example.com/');
  });

  it('keeps a port and a deep path intact', () => {
    expect(helpUrl('http://localhost:7006', 'inventory')).toBe(`http://localhost:7006${HELP_TOPICS.inventory}`);
  });
});
