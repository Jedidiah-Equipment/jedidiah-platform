import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import fastifyHttpProxy from '@fastify/http-proxy';
import fastifyStatic from '@fastify/static';
import type { FastifyReply } from 'fastify';
import Fastify from 'fastify';

import type { InjectedClientConfig, ServerConfig } from './env.js';

type WebServerOptions = {
  distDir?: string;
};

export function buildWebServer(config: ServerConfig, options: WebServerOptions = {}) {
  const distDir = options.distDir ?? join(process.cwd(), 'dist');
  const app = Fastify();

  app.register(fastifyStatic, {
    prefix: '/__static__/',
    root: distDir,
    wildcard: false,
  });

  app.register(fastifyHttpProxy, {
    upstream: config.posthogProxy.assetHost,
    prefix: config.posthogProxy.assetPath,
    rewritePrefix: '/static',
  });

  app.register(fastifyHttpProxy, {
    upstream: config.posthogProxy.ingestHost,
    prefix: config.posthogProxy.apiPath,
    rewritePrefix: '',
  });

  app.get('/health', async () => ({
    ok: true,
    ...config.deployment,
  }));

  app.get('/assets/*', (request, reply) => {
    const { '*': assetPath } = request.params as { '*': string };

    return reply.sendFile(`assets/${assetPath}`, { immutable: true, maxAge: '1y' });
  });

  app.get('/*', async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    if (pathname !== '/' && extname(pathname) !== '') {
      return reply.sendFile(pathname.slice(1));
    }

    return sendIndexHtml(reply, distDir, config.clientConfig);
  });

  return app;
}

function publicConfigScript(clientConfig: InjectedClientConfig): string {
  const serializedConfig = JSON.stringify(clientConfig).replace(/</g, '\\u003c');

  return `window.__APP_CONFIG__ = ${serializedConfig};`;
}

async function sendIndexHtml(reply: FastifyReply, distDir: string, clientConfig: InjectedClientConfig): Promise<void> {
  const index = await readFile(join(distDir, 'index.html'), 'utf8');
  const configScript = `<script>${publicConfigScript(clientConfig)}</script>`;
  const html = index.includes('</head>')
    ? index.replace('</head>', `    ${configScript}\n  </head>`)
    : `${configScript}\n${index}`;

  reply.header('Cache-Control', 'no-store');
  reply.type('text/html; charset=utf-8');
  reply.send(html);
}
