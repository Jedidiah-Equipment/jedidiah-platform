import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HelpIcon } from './HelpIcon.js';
import { HelpLink } from './HelpLink.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HelpIcon', () => {
  it('renders the canonical circled-question-mark glyph', () => {
    expect(renderToStaticMarkup(<HelpIcon />)).toContain('tabler-icon-help-circle');
  });
});

describe('HelpLink', () => {
  it('opens a specifically labelled topic in the public docs', () => {
    stubClientConfig('https://help.example.com');

    const html = renderToStaticMarkup(<HelpLink label="How to stamp fabrication times" topic="jobFabrication" />);

    expect(html).toContain('aria-label="How to stamp fabrication times"');
    expect(html).toContain('href="https://help.example.com/production/stamp-fabrication-times"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('tabler-icon-help-circle');
    expect(html).toContain('text-primary');
    expect(html).toContain('size-5');
  });

  it('renders nothing when no docs site is configured', () => {
    stubClientConfig(null);

    expect(renderToStaticMarkup(<HelpLink label="Open Help" topic="home" />)).toBe('');
  });
});

function stubClientConfig(docsBaseUrl: string | null): void {
  vi.stubGlobal('window', {
    __APP_CONFIG__: {
      appBaseUrl: 'http://localhost:7001',
      appEnv: 'development',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      docsBaseUrl,
    },
  });
}
