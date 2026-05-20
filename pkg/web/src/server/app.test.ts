import { mkdtemp, writeFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildWebServer } from './app.js';
import type { ServerConfig } from './env.js';

function mockConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 7001,
    posthogProxy: {
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
});
