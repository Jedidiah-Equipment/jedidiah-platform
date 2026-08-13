// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

beforeEach(() => {
  document.head.innerHTML = '';
  delete window.fbq;
  delete window._fbq;
  delete window.__jedidiahMetaPixelIds;
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Meta Pixel', () => {
  test('stays disabled when no pixel ID is configured', async () => {
    const { initMetaPixel } = await import('./meta-pixel.js');

    expect(initMetaPixel(null)).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.querySelector('script[data-meta-pixel]')).toBeNull();
  });

  test('installs the official command queue and loads the script once', async () => {
    const { initMetaPixel } = await import('./meta-pixel.js');

    expect(initMetaPixel('27975094252106874')).toBe(true);
    expect(initMetaPixel('27975094252106874')).toBe(true);

    expect(window.fbq?.queue).toEqual([['init', '27975094252106874']]);
    const scripts = document.querySelectorAll('script[data-meta-pixel]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute('src')).toBe('https://connect.facebook.net/en_US/fbevents.js');
  });

  test('sends standard events and the Lead deduplication ID', async () => {
    const { initMetaPixel, trackMetaLead, trackMetaPageView, trackMetaViewContent } = await import('./meta-pixel.js');
    const fbq = vi.fn() as unknown as NonNullable<Window['fbq']>;
    window.fbq = fbq;

    initMetaPixel('27975094252106874');
    trackMetaPageView('27975094252106874');
    trackMetaViewContent('view-123', '27975094252106874');
    trackMetaLead('lead-123', '27975094252106874');

    expect(fbq).toHaveBeenNthCalledWith(1, 'init', '27975094252106874');
    expect(fbq).toHaveBeenNthCalledWith(2, 'track', 'PageView');
    expect(fbq).toHaveBeenNthCalledWith(3, 'track', 'ViewContent', {}, { eventID: 'view-123' });
    expect(fbq).toHaveBeenNthCalledWith(4, 'track', 'Lead', {}, { eventID: 'lead-123' });
  });

  test('generates a unique event ID for browser/server deduplication', async () => {
    const { createMetaEventId } = await import('./meta-pixel.js');

    const first = createMetaEventId();
    const second = createMetaEventId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(first);
  });

  test('generates an event ID when randomUUID is unavailable', async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const { createMetaEventId } = await import('./meta-pixel.js');

    expect(createMetaEventId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  test('sends PageView only for completed client-side navigations', async () => {
    const { trackMetaPageViewForNavigation } = await import('./meta-pixel.js');
    const trackPageView = vi.fn();

    trackMetaPageViewForNavigation({ hrefChanged: true }, trackPageView);
    trackMetaPageViewForNavigation({ fromLocation: {}, hrefChanged: false }, trackPageView);
    trackMetaPageViewForNavigation({ fromLocation: {}, hrefChanged: true }, trackPageView);

    expect(trackPageView).toHaveBeenCalledOnce();
  });

  test('builds the JavaScript-disabled PageView URL only when configured', async () => {
    const { metaPixelBaseCode, metaPixelNoScriptUrl } = await import('./meta-pixel.js');

    expect(metaPixelNoScriptUrl(null)).toBeNull();
    expect(metaPixelNoScriptUrl('27975094252106874')).toBe(
      'https://www.facebook.com/tr?id=27975094252106874&ev=PageView&noscript=1',
    );
    expect(metaPixelBaseCode('27975094252106874')).toContain('fbq(\'init\',"27975094252106874")');
    expect(metaPixelBaseCode('27975094252106874')).toContain("fbq('track','PageView')");
  });

  test('recognises initialization performed by the head base code', async () => {
    const { initMetaPixel } = await import('./meta-pixel.js');
    const fbq = vi.fn() as unknown as NonNullable<Window['fbq']>;
    window.fbq = fbq;
    window.__jedidiahMetaPixelIds = ['27975094252106874'];
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.append(script);

    initMetaPixel('27975094252106874');

    expect(fbq).not.toHaveBeenCalled();
    expect(document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).toHaveLength(1);
  });
});
