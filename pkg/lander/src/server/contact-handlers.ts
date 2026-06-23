import { EmailAddress, requiredTrimmedText } from '@pkg/schema';
import { Resend } from 'resend';
import { z } from 'zod';

import { getLanderConfig } from './env.js';

// The enquiry form payload. Name, email, and message are required; phone and equipment are optional
// context. Lengths are capped so a malformed or abusive body is rejected before any Resend call.
export type ContactLead = z.infer<typeof ContactLead>;
export const ContactLead = z.object({
  name: requiredTrimmedText('Please enter your name').max(120),
  email: EmailAddress.pipe(z.string().max(200)),
  phone: z.string().trim().max(40).default(''),
  equipment: z.string().trim().max(120).default(''),
  message: requiredTrimmedText('Please enter a message').max(4000),
});

// Resolved Resend settings for the Contact form, or null when no API key is configured. Returning null
// (rather than throwing) keeps page load safe: a missing key only blocks form submission (issue #568).
export type ContactEmailConfig = { apiKey: string; from: string; to: string };

export function getContactEmailConfig(): ContactEmailConfig | null {
  const config = getLanderConfig();
  if (!config.RESEND_API_KEY) {
    return null;
  }

  return { apiKey: config.RESEND_API_KEY, from: config.CONTACT_EMAIL_FROM, to: config.CONTACT_EMAIL_TO };
}

export type ContactLeadEmail = { subject: string; html: string; text: string; replyTo: string };

// Builds the lead email the company inbox receives. The visitor's email becomes the reply-to so a reply
// goes straight back to them, while the from stays the verified sender Resend requires.
export function buildContactLeadEmail(lead: ContactLead): ContactLeadEmail {
  const equipment = lead.equipment || 'Not specified';
  const phone = lead.phone || 'Not provided';

  const lines = [
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${phone}`,
    `Equipment of interest: ${equipment}`,
    '',
    'Message:',
    lead.message,
  ];

  const html = [
    '<h2>New enquiry from the website</h2>',
    `<p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>`,
    `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>`,
    `<p><strong>Equipment of interest:</strong> ${escapeHtml(equipment)}</p>`,
    `<p><strong>Message:</strong></p>`,
    `<p>${escapeHtml(lead.message).replace(/\n/g, '<br>')}</p>`,
  ].join('');

  return {
    subject: `Website enquiry from ${lead.name}`,
    html,
    text: lines.join('\n'),
    replyTo: lead.email,
  };
}

export type SendContactLead = (lead: ContactLead, config: ContactEmailConfig) => Promise<void>;

// Sends the lead email through Resend, called directly here because @pkg/api's sender is coupled to API
// config and its EmailType union (issue #568). A Resend error is surfaced so the route returns a 502.
const sendContactLeadViaResend: SendContactLead = async (lead, config) => {
  const email = buildContactLeadEmail(lead);
  const resend = new Resend(config.apiKey);

  const { error } = await resend.emails.send({
    from: config.from,
    to: config.to,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  if (error) {
    throw new Error(`Failed to send contact email via Resend: ${error.message}`);
  }
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Server-only handler for POST /api/contact. Parses and validates the JSON body, sends the lead email, and
// maps each outcome to a JSON response: 400 invalid fields, 503 no Resend config, 502 send failure, 200 ok.
// `deps` is injectable so tests can exercise the flow without a live Resend client.
export async function handleContactRequest(
  request: Request,
  deps: { config?: ContactEmailConfig | null; send?: SendContactLead } = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Expected a JSON request body' }, 400);
  }

  const parsed = ContactLead.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: 'Please check the form and try again', issues: z.treeifyError(parsed.error) }, 400);
  }

  const config = deps.config === undefined ? getContactEmailConfig() : deps.config;
  if (!config) {
    return jsonResponse({ error: 'The contact form is not available right now. Please email us directly.' }, 503);
  }

  const send = deps.send ?? sendContactLeadViaResend;
  try {
    await send(parsed.data, config);
  } catch {
    return jsonResponse({ error: 'We could not send your message. Please try again or email us directly.' }, 502);
  }

  return jsonResponse({ ok: true }, 200);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
