import { describe, expect, test, vi } from 'vitest';

import {
  buildContactLeadEmail,
  type ContactEmailConfig,
  ContactLead,
  getContactEmailConfig,
  handleContactRequest,
} from './contact-handlers.js';

const CONFIG: ContactEmailConfig = { apiKey: 'test-key', from: 'noreply@example.com', to: 'info@example.com' };

function contactRequest(body: unknown): Request {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: '  Sipho Dlamini  ',
  email: 'Sipho@Example.com',
  phone: ' +27 11 555 0000 ',
  equipment: 'Crosshaul (Trailers)',
  message: 'Looking for a 14-ton tipping trailer.',
};

describe('ContactLead', () => {
  test('trims and normalises a valid payload', () => {
    const parsed = ContactLead.parse(VALID_BODY);

    expect(parsed.name).toBe('Sipho Dlamini');
    expect(parsed.email).toBe('sipho@example.com');
    expect(parsed.phone).toBe('+27 11 555 0000');
    expect(parsed.message).toBe('Looking for a 14-ton tipping trailer.');
  });

  test('defaults optional phone and equipment to empty strings', () => {
    const parsed = ContactLead.parse({ name: 'Ann', email: 'ann@example.com', message: 'Hi' });

    expect(parsed.phone).toBe('');
    expect(parsed.equipment).toBe('');
  });

  test.each([
    ['missing name', { ...VALID_BODY, name: '   ' }],
    ['invalid email', { ...VALID_BODY, email: 'not-an-email' }],
    ['missing message', { ...VALID_BODY, message: '' }],
  ])('rejects %s', (_label, body) => {
    expect(ContactLead.safeParse(body).success).toBe(false);
  });
});

describe('buildContactLeadEmail', () => {
  test('summarises the lead and replies to the visitor', () => {
    const email = buildContactLeadEmail(ContactLead.parse(VALID_BODY));

    expect(email.subject).toBe('Website enquiry from Sipho Dlamini');
    expect(email.replyTo).toBe('sipho@example.com');
    expect(email.text).toContain('Looking for a 14-ton tipping trailer.');
    expect(email.text).toContain('Crosshaul (Trailers)');
    expect(email.html).toContain('sipho@example.com');
  });

  test('shows placeholders when optional fields are blank', () => {
    const email = buildContactLeadEmail(ContactLead.parse({ name: 'Ann', email: 'ann@example.com', message: 'Hi' }));

    expect(email.text).toContain('Phone: Not provided');
    expect(email.text).toContain('Equipment of interest: Not specified');
  });

  test('escapes HTML in visitor-supplied content', () => {
    const email = buildContactLeadEmail(
      ContactLead.parse({ name: 'Ann', email: 'ann@example.com', message: '<script>alert(1)</script>' }),
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

describe('handleContactRequest', () => {
  test('sends the lead and returns 200 on a valid submission', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const response = await handleContactRequest(contactRequest(VALID_BODY), { config: CONFIG, send });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [lead, config] = send.mock.calls[0] ?? [];
    expect(lead).toMatchObject({ name: 'Sipho Dlamini', email: 'sipho@example.com' });
    expect(config).toBe(CONFIG);
  });

  test('returns 400 for an invalid submission without sending', async () => {
    const send = vi.fn();

    const response = await handleContactRequest(contactRequest({ name: '', email: 'bad', message: '' }), {
      config: CONFIG,
      send,
    });

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  test('returns 400 for a non-JSON body', async () => {
    const response = await handleContactRequest(contactRequest('not json'), { config: CONFIG, send: vi.fn() });

    expect(response.status).toBe(400);
  });

  test('returns 503 when Resend is not configured', async () => {
    const send = vi.fn();

    const response = await handleContactRequest(contactRequest(VALID_BODY), { config: null, send });

    expect(response.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  test('returns 502 when sending fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('resend down'));

    const response = await handleContactRequest(contactRequest(VALID_BODY), { config: CONFIG, send });

    expect(response.status).toBe(502);
  });
});

describe('getContactEmailConfig', () => {
  test('returns null when RESEND_API_KEY is absent so page load stays safe', () => {
    // The committed lander .env has no RESEND_API_KEY, so the fail-safe path is the default in tests.
    expect(getContactEmailConfig()).toBeNull();
  });
});
