import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from './env.js';
import { log } from './logger.js';
import type { Observability } from './observability.js';
import { buildServer } from './server.js';

vi.mock('./auth/session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth/session.js')>();

  return {
    ...actual,
    getSessionFromHeaders: vi.fn(async () => null),
  };
});

const config: ApiConfig = {
  NODE_ENV: 'test',
  APP_ENV: 'development',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/postgres',
  APP_BASE_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:7002',
  AUTH_SECRET: 'a'.repeat(32),
  AUTH_TRUSTED_ORIGINS: ['http://localhost:5173', 'http://localhost:7003'],
  EMAIL_PROVIDER: 'mock',
  EMAIL_FROM: 'noreply@jedidiahequipment.co.za',
  DOCUMENT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
  DOCUMENT_STORAGE_BUCKET: 'jedidiah-documents',
  DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
  DOCUMENT_STORAGE_FORCE_PATH_STYLE: true,
  DOCUMENT_STORAGE_REGION: 'us-east-1',
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
  API_IMAGE_CACHE_DIR: '/tmp/jedidiah-api-image-cache-test',
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'gpt-5.5',
  OPENAI_REASONING_EFFORT: 'low',
  OPENAI_TRANSLATION_MODEL: 'gpt-5.5',
  OPENAI_TRANSCRIPTION_MODEL: 'gpt-transcribe',
  POSTHOG_HOST: 'https://us.i.posthog.com',
  PORT: 7002,
  LOG_LEVEL: 'silent',
};

const observability: Observability = {
  enabled: false,
  captureException: vi.fn(),
  flush: vi.fn(async () => undefined),
};

describe('API server', () => {
  it.each(['development', 'staging', 'production'] as const)('registers the assistant in %s', async (APP_ENV) => {
    const app = await buildServer({ ...config, APP_ENV }, observability, new MemoryStorage());

    try {
      expect(app.hasRoute({ method: 'POST', url: '/ai/chat' })).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('never writes a secret to the startup log', async () => {
    const secrets = {
      DATABASE_URL: 'postgres://app:db-password-canary@db.internal:5432/app',
      TEST_DATABASE_URL: 'postgres://app:test-db-password-canary@db.internal:5432/app_test',
      AUTH_SECRET: 'auth-secret-canary'.padEnd(32, 'x'),
      RESEND_API_KEY: 'resend-key-canary',
      DOCUMENT_STORAGE_ACCESS_KEY_ID: 'storage-access-key-canary',
      DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'storage-secret-canary',
      OPENAI_API_KEY: 'openai-key-canary',
      POSTHOG_PROJECT_TOKEN: 'posthog-token-canary',
    } satisfies Partial<ApiConfig>;
    const info = vi.spyOn(log.root, 'info');
    const app = await buildServer({ ...config, ...secrets }, observability, new MemoryStorage());

    try {
      const written = JSON.stringify(info.mock.calls);

      expect(written).toContain('Building server');
      expect(written).toContain(config.API_BASE_URL);
      for (const [key, value] of Object.entries(secrets)) {
        expect(written, key).not.toContain(value);
      }
      expect(written).not.toContain('canary');
    } finally {
      info.mockRestore();
      await app.close();
    }
  });

  it('routes long tRPC GET batch paths', async () => {
    const app = await buildServer(config, observability, new MemoryStorage());
    const path = [
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
      'auth.session',
    ].join(',');

    try {
      const response = await app.inject(`/trpc/${path}?batch=1`);

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual(Array.from({ length: 10 }, () => ({ result: { data: null } })));
    } finally {
      await app.close();
    }
  });

  // Only the Lander belongs in search results. Google crawls this host already — it reports the 404 at `/` —
  // and `/health` answers 200 to anyone, so the directive has to ride every response rather than the routes
  // someone remembered to annotate. There is no HTML here to carry a meta tag, so the header is all there is.
  it('marks every response noindex, whatever its route or status', async () => {
    const app = await buildServer(config, observability, new MemoryStorage());

    try {
      for (const url of ['/health', '/', '/trpc/auth.session']) {
        const response = await app.inject(url);

        expect(response.headers['x-robots-tag'], `${url} -> ${response.statusCode}`).toBe('noindex, nofollow');
      }
    } finally {
      await app.close();
    }
  });

  it('allows the local Expo dev server through CORS', async () => {
    const app = await buildServer(config, observability, new MemoryStorage());

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:7003',
        },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:7003');
    } finally {
      await app.close();
    }
  });

  it('allows PostHog trace correlation headers through browser preflight', async () => {
    const app = await buildServer(config, observability, new MemoryStorage());

    try {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/trpc/auth.session',
        headers: {
          origin: 'http://localhost:7003',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-posthog-distinct-id,x-posthog-session-id',
        },
      });

      expect(response.statusCode, response.body).toBe(204);
      expect(response.headers['access-control-allow-headers']).toBe(
        'Content-Type, Authorization, X-Requested-With, X-POSTHOG-DISTINCT-ID, X-POSTHOG-SESSION-ID',
      );
    } finally {
      await app.close();
    }
  });
});

class MemoryStorage implements StorageAdapter {
  async deleteObject(): Promise<void> {
    return undefined;
  }

  async get(): Promise<StoredObject> {
    throw new Error('Storage object not found');
  }

  async put(_input: StoragePutInput): Promise<void> {
    return undefined;
  }
}
