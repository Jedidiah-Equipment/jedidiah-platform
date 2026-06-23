import { describe, expect, test, vi } from 'vitest';

import { assetUpstreamUrl, ingestUpstreamUrl, proxyPosthogIngest, proxyRequest } from './posthog-proxy.js';

describe('upstream url mapping', () => {
  test('maps the /info prefix to the ingest host, preserving the query', () => {
    expect(ingestUpstreamUrl('http://lander.test/info/e/?ip=0&ver=1')).toBe('https://us.i.posthog.com/e/?ip=0&ver=1');
    expect(ingestUpstreamUrl('http://lander.test/info/array/phc_x/config.js')).toBe(
      'https://us.i.posthog.com/array/phc_x/config.js',
    );
  });

  test('maps /info/static/* to the asset host under /static', () => {
    expect(assetUpstreamUrl('http://lander.test/info/static/recorder.js?v=2')).toBe(
      'https://us-assets.i.posthog.com/static/recorder.js?v=2',
    );
  });
});

describe('proxyRequest', () => {
  test('forwards method and body, strips hop-by-hop request headers, and cleans the response', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response('ok', {
        status: 200,
        headers: { 'content-encoding': 'gzip', 'content-length': '999', 'x-keep': 'yes' },
      });
    }) as unknown as typeof fetch;

    const request = new Request('http://lander.test/info/e/', {
      method: 'POST',
      headers: { host: 'lander.test', 'content-length': '4', 'content-type': 'text/plain' },
      body: 'data',
    });

    const response = await proxyRequest(request, 'https://us.i.posthog.com/e/', fakeFetch);

    expect(seenUrl).toBe('https://us.i.posthog.com/e/');
    expect(seenInit?.method).toBe('POST');
    expect(new Headers(seenInit?.headers).get('host')).toBeNull();
    expect(new Headers(seenInit?.headers).get('content-length')).toBeNull();
    expect(new Headers(seenInit?.headers).get('content-type')).toBe('text/plain');
    // The decoded body must not advertise a stale encoding/length.
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-keep')).toBe('yes');
    expect(response.status).toBe(200);
  });
});

describe('proxyPosthogIngest', () => {
  test('returns 404 when PostHog is not configured so the proxy is not an open relay', async () => {
    // The lander test env has no VITE_POSTHOG_KEY, so the proxy stays closed.
    const response = await proxyPosthogIngest(new Request('http://lander.test/info/e/', { method: 'POST' }));

    expect(response.status).toBe(404);
  });
});
