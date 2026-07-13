import { beforeEach, describe, expect, test } from 'vitest';

import { clearMockEmailMessages, getMockEmailMessages } from '@/email/index.js';
import { sendAiEmail } from './ai-email.js';

beforeEach(() => {
  clearMockEmailMessages();
});

describe('sendAiEmail', () => {
  test('delivers the authored body and resolved attachment through the API email adapter', async () => {
    await sendAiEmail({
      attachments: [
        {
          content: new Uint8Array([1, 2, 3]),
          contentType: 'application/pdf',
          filename: 'QUO-00008-rev-1.pdf',
        },
      ],
      body: 'Hello Acme,\n\nPlease find the quote attached.',
      subject: 'Draft quote QUO-00008',
      to: 'sales@example.com',
    });

    expect(getMockEmailMessages()).toEqual([
      {
        attachmentFilenames: ['QUO-00008-rev-1.pdf'],
        subject: 'Draft quote QUO-00008',
        text: 'Hello Acme,\n\nPlease find the quote attached.',
        to: 'sales@example.com',
        type: 'assistant',
      },
    ]);
  });
});
