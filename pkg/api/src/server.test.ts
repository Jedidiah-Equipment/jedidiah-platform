import type { StorageAdapter, StoragePutInput, StoredObject } from '@pkg/core';
import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from './env.js';
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
  OPENAI_API_KEY: 'test-key',
  OPENAI_MODEL: 'gpt-5.5',
  OPENAI_REASONING_EFFORT: 'low',
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
  it('registers the assistant in the development environment', async () => {
    const app = await buildServer(config, observability, new MemoryStorage());
    try {
      expect(app.hasRoute({ method: 'POST', url: '/ai/chat' })).toBe(true);
    } finally {
      await app.close();
    }
  });

  it.each(['staging', 'production'] as const)('does not register the assistant in %s', async (APP_ENV) => {
    const app = await buildServer({ ...config, APP_ENV }, observability, new MemoryStorage());

    try {
      expect(app.hasRoute({ method: 'POST', url: '/ai/chat' })).toBe(false);

      const response = await app.inject({ method: 'POST', url: '/ai/chat', payload: { messages: [] } });
      expect(response.statusCode).toBe(404);
    } finally {
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
