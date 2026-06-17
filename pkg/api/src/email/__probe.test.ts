import { describe, expect, test } from 'vitest';
import * as viaIndex from '@/email/index.js';
import { emailSender } from '@/email/index.js';
import * as viaAlias from '@/email/mock-email.js';
import { getApiConfig } from '@/env.js';

describe('probe', () => {
  test('module identity + send path', async () => {
    viaAlias.clearMockEmailMessages();
    await emailSender.send({
      to: 'probe@example.com',
      subject: 's',
      html: 'h',
      text: 't',
      url: 'u',
      token: 'tok',
      type: 'email-verification',
    });
    const sameRef = viaAlias.getMockEmailMessages === viaIndex.getMockEmailMessages;
    const msgs = viaAlias.getMockEmailMessages();
    expect({
      provider: getApiConfig().EMAIL_PROVIDER,
      sameRef,
      msgs,
    }).toEqual('FORCE_FAIL_TO_SEE_VALUES');
  });
});
