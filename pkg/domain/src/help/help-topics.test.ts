import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, helpUrl, resolveDocsOrigin } from './help-topics.js';

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

describe('resolveDocsOrigin', () => {
  it('offers no Help when no docs site is configured', () => {
    expect(resolveDocsOrigin(undefined, 'development')).toBeNull();
    expect(resolveDocsOrigin(null, 'production')).toBeNull();
    expect(resolveDocsOrigin('', 'development')).toBeNull();
  });

  it('takes a configured origin and strips its trailing slashes', () => {
    expect(resolveDocsOrigin('https://docs.example.com///', 'production')).toBe('https://docs.example.com');
  });

  it('keeps a loopback origin in development, where it is the local docs server', () => {
    expect(resolveDocsOrigin('http://localhost:7006', 'development')).toBe('http://localhost:7006');
  });

  it('drops a loopback origin once deployed, rather than pointing a tablet at itself', () => {
    expect(resolveDocsOrigin('http://localhost:7006', 'staging')).toBeNull();
    expect(resolveDocsOrigin('http://127.0.0.1:7006', 'production')).toBeNull();
    expect(resolveDocsOrigin('http://[::1]:7006', 'production')).toBeNull();
  });

  it('treats an unparseable origin as configured rather than swallowing it', () => {
    expect(resolveDocsOrigin('not a url', 'production')).toBe('not a url');
  });
});
