import { beforeEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../env.js';
import { createEmailSender } from './email-sender.js';
import { clearMockEmailMessages, getMockEmailMessages } from './mock-email.js';

function mockConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost/test',
    APP_BASE_URL: 'http://localhost:3000',
    API_BASE_URL: 'http://localhost:7002',
    AUTH_SECRET: 'a'.repeat(32),
    AUTH_TRUSTED_ORIGINS: ['http://localhost:3000'],
    EMAIL_PROVIDER: 'mock',
    EMAIL_FROM: 'noreply@jedidiahequipment.co.za',
    RESEND_API_KEY: undefined,
    DOCUMENT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
    DOCUMENT_STORAGE_BUCKET: 'jedidiah-documents',
    DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
    DOCUMENT_STORAGE_FORCE_PATH_STYLE: true,
    DOCUMENT_STORAGE_REGION: 'us-east-1',
    DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-5.5',
    OPENAI_REASONING_EFFORT: 'low',
    PORT: 7002,
    LOG_LEVEL: 'silent',
    LOG_DOMAINS_DISABLED: undefined,
    ...overrides,
  } as unknown as ApiConfig;
}

const testPayload = {
  to: 'user@example.com',
  subject: 'Test subject',
  html: '<p>Test</p>',
  text: 'Test',
  url: 'http://localhost:3000/verify-email?token=abc123',
  token: 'abc123',
  type: 'email-verification' as const,
};

describe('createEmailSender', () => {
  beforeEach(() => {
    clearMockEmailMessages();
  });

  it('returns mock sender when EMAIL_PROVIDER is mock', async () => {
    const sender = createEmailSender(mockConfig({ EMAIL_PROVIDER: 'mock' }));
    await sender.send(testPayload);
    const messages = getMockEmailMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      to: 'user@example.com',
      type: 'email-verification',
      token: 'abc123',
    });
  });

  it('records mock emails with correct type', async () => {
    const sender = createEmailSender(mockConfig());
    await sender.send({ ...testPayload, type: 'password-reset', token: 'reset-tok' });
    expect(getMockEmailMessages()[0]).toMatchObject({ type: 'password-reset', token: 'reset-tok' });
  });

  it('records assistant emails with attachment filenames', async () => {
    const sender = createEmailSender(mockConfig());
    await sender.send({
      to: 'user@example.com',
      subject: 'Draft quote QUO-00001 — Acme Mining',
      html: '<p>Draft</p>',
      text: 'Draft',
      type: 'assistant',
      attachments: [
        { content: new Uint8Array([1, 2, 3]), filename: 'QUO-00001-rev-1.pdf', contentType: 'application/pdf' },
      ],
    });
    expect(getMockEmailMessages()[0]).toMatchObject({
      to: 'user@example.com',
      type: 'assistant',
      attachmentFilenames: ['QUO-00001-rev-1.pdf'],
    });
  });

  it('returns Resend sender when EMAIL_PROVIDER is resend and key is present', () => {
    const sender = createEmailSender(mockConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key' }));
    expect(typeof sender.send).toBe('function');
  });
});

describe('ApiConfig email validation', () => {
  it('throws when EMAIL_PROVIDER is resend and RESEND_API_KEY is missing', async () => {
    const { ApiConfig } = await import('../env.js');
    expect(() =>
      ApiConfig.parse({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        APP_BASE_URL: 'http://localhost:3000',
        API_BASE_URL: 'http://localhost:7002',
        AUTH_SECRET: 'a'.repeat(32),
        AUTH_TRUSTED_ORIGINS: 'http://localhost:3000',
        DOCUMENT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
        DOCUMENT_STORAGE_BUCKET: 'jedidiah-documents',
        DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
        DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
        DOCUMENT_STORAGE_REGION: 'us-east-1',
        DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
        EMAIL_PROVIDER: 'resend',
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toThrow('RESEND_API_KEY is required when EMAIL_PROVIDER is resend');
  });

  it('accepts resend provider when RESEND_API_KEY is provided', async () => {
    const { ApiConfig } = await import('../env.js');
    expect(() =>
      ApiConfig.parse({
        APP_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/test',
        APP_BASE_URL: 'http://localhost:3000',
        API_BASE_URL: 'http://localhost:7002',
        AUTH_SECRET: 'a'.repeat(32),
        AUTH_TRUSTED_ORIGINS: 'http://localhost:3000',
        DOCUMENT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
        DOCUMENT_STORAGE_BUCKET: 'jedidiah-documents',
        DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
        DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
        DOCUMENT_STORAGE_REGION: 'us-east-1',
        DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_live_key',
        OPENAI_API_KEY: 'sk-test',
        POSTHOG_ENABLED: 'false',
      }),
    ).not.toThrow();
  });
});
