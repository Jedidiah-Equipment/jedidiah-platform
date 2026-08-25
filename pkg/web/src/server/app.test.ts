import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildWebServer } from './app.js';
import type { ServerConfig } from './env.js';

type AppEnv = ServerConfig['clientConfig']['appEnv'];

function mockConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 7001,
    posthogProxy: {
      enabled: false,
      apiPath: '/info',
      assetPath: '/info/static',
      ingestHost: 'https://us.i.posthog.com',
      assetHost: 'https://us-assets.i.posthog.com',
    },
    posthogSourceMaps: {
      enabled: false,
      apiKey: null,
      projectId: null,
      host: 'https://us.posthog.com',
    },
    deployment: {
      appEnv: 'development',
      serviceName: null,
      environmentName: null,
      deploymentId: null,
      snapshotId: null,
      commitSha: null,
    },
    clientConfig: {
      appEnv: 'development',
      appBaseUrl: 'http://localhost:7001',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      docsBaseUrl: 'http://localhost:7006',
      deploymentVersion: null,
      posthog: {
        enabled: false,
        token: undefined,
        apiHost: '/info',
        uiHost: 'https://us.posthog.com',
        release: null,
      },
    },
    ...overrides,
  };
}

async function buildAppWithEnv(appEnv: AppEnv) {
  const distDir = await mkdtemp(join(tmpdir(), 'jed-web-'));
  await writeFile(
    join(distDir, 'index.html'),
    '<html lang="en"><head><link rel="icon" href="/favicon-yellow.png"></head><body>app</body></html>',
  );
  const config = mockConfig();

  return buildWebServer(
    mockConfig({
      clientConfig: {
        ...config.clientConfig,
        appEnv,
      },
    }),
    { distDir },
  );
}

describe('web server', () => {
  it('proxies PostHog API requests before the SPA fallback', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'jed-web-'));
    await writeFile(join(distDir, 'index.html'), '<html><head></head><body>app</body></html>');
    const forwardedRequests: Array<{ body: unknown; headers: IncomingHttpHeaders; query: unknown }> = [];
    const upstream = Fastify();
    upstream.post('/e/', async (request, reply) => {
      forwardedRequests.push({
        body: request.body,
        headers: request.headers,
        query: request.query,
      });

      return reply.status(202).send({ ok: true });
    });
    await upstream.listen({ host: '127.0.0.1', port: 0 });
    const upstreamAddress = upstream.server.address();
    if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream server address');
    const app = buildWebServer(
      mockConfig({
        posthogProxy: {
          enabled: true,
          apiPath: '/info',
          assetPath: '/info/static',
          ingestHost: `http://127.0.0.1:${upstreamAddress.port}`,
          assetHost: 'https://us-assets.i.posthog.com',
        },
      }),
      { distDir },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/info/e/?ip=1',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest',
      },
      payload: { event: 'test' },
    });

    expect(response.statusCode).toBe(202);
    expect(forwardedRequests).toHaveLength(1);
    expect(forwardedRequests[0]).toMatchObject({
      body: { event: 'test' },
      query: { ip: '1' },
    });
    expect(forwardedRequests[0]?.headers['content-type']).toContain('application/json');
    await app.close();
    await upstream.close();
  });

  it('proxies PostHog static assets through the asset host', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'jed-web-'));
    await writeFile(join(distDir, 'index.html'), '<html><head></head><body>app</body></html>');
    const assetRequests: string[] = [];
    const upstream = Fastify();
    upstream.get('/static/array.js', async (request, reply) => {
      assetRequests.push(request.url);
      return reply.type('application/javascript').send('window.__ph=true;');
    });
    await upstream.listen({ host: '127.0.0.1', port: 0 });
    const upstreamAddress = upstream.server.address();
    if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream server address');
    const app = buildWebServer(
      mockConfig({
        posthogProxy: {
          enabled: true,
          apiPath: '/info',
          assetPath: '/info/static',
          ingestHost: 'https://us.i.posthog.com',
          assetHost: `http://127.0.0.1:${upstreamAddress.port}`,
        },
      }),
      { distDir },
    );

    const response = await app.inject('/info/static/array.js?v=1');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('window.__ph=true;');
    expect(assetRequests).toEqual(['/static/array.js?v=1']);
    await app.close();
    await upstream.close();
  });

  it('injects client config through the SPA fallback', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'jed-web-'));
    await writeFile(join(distDir, 'index.html'), '<html><head></head><body>app</body></html>');
    const app = buildWebServer(mockConfig(), { distDir });

    const response = await app.inject('/jobs');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('window.__APP_CONFIG__');
    expect(response.body).toContain('"apiHost":"/info"');
    await app.close();
  });

  it('marks staging HTML and swaps the favicon before the SPA fallback response is sent', async () => {
    const app = await buildAppWithEnv('staging');

    const response = await app.inject('/jobs');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<html data-app-env="staging" lang="en">');
    expect(response.body).toContain('/favicon-pink.png');
    expect(response.body).not.toContain('/favicon-yellow.png');
    await app.close();
  });

  it.each(['development', 'production'] as const)(
    'keeps %s HTML on the default favicon without a staging attribute',
    async (appEnv) => {
      const app = await buildAppWithEnv(appEnv);

      const response = await app.inject('/jobs');

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('data-app-env=');
      expect(response.body).toContain('/favicon-yellow.png');
      expect(response.body).not.toContain('/favicon-pink.png');
      await app.close();
    },
  );

  // Google had indexed this app. Only the Lander belongs in search results.
  describe('search indexing', () => {
    it('sends X-Robots-Tag on the SPA document, an asset route, and a JSON endpoint alike', async () => {
      const app = await buildAppWithEnv('production');

      for (const url of ['/jobs', '/app-version', '/robots.txt']) {
        const response = await app.inject(url);

        expect(response.headers['x-robots-tag'], url).toBe('noindex, nofollow');
      }

      await app.close();
    });

    // The fixtures above write their own minimal shell, so the header tests cannot speak for the real one.
    // Every route serves this single document, which makes its meta tag the app-wide directive.
    it('carries a noindex meta in the shipped HTML shell', async () => {
      const shell = await readFile(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

      expect(shell).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
    });

    // A crawler has to be allowed to fetch a page to learn that it must not index it, so the one thing this
    // file must never grow is a `Disallow`.
    it('allows crawling, so the noindex directive is actually read', async () => {
      const app = await buildAppWithEnv('production');

      const response = await app.inject('/robots.txt');

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toBe('User-agent: *\nAllow: /\n');
      expect(response.body).not.toMatch(/Disallow/i);
      await app.close();
    });
  });

  it('returns the current app deployment version without caching', async () => {
    const distDir = await mkdtemp(join(tmpdir(), 'jed-web-'));
    await writeFile(join(distDir, 'index.html'), '<html><head></head><body>app</body></html>');
    const app = buildWebServer(
      mockConfig({
        clientConfig: {
          ...mockConfig().clientConfig,
          deploymentVersion: 'abc123',
        },
      }),
      { distDir },
    );

    const response = await app.inject('/app-version');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({ deploymentVersion: 'abc123' });
    await app.close();
  });
});
