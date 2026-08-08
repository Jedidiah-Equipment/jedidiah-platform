// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { captureEvent } from '../../lib/analytics.js';
import { EnquiryForm } from './contact.js';

vi.mock('../../lib/analytics.js', () => ({
  captureEvent: vi.fn(),
  captureEventForNavigation: vi.fn(),
}));

async function renderForm(root: Root) {
  await act(async () => root.render(<EnquiryForm equipmentOptions={['Crosshaul']} />));
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement {
  const element = document.querySelector(`[name="${name}"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`missing field ${name}`);
  }
  return element;
}

async function submit() {
  const form = document.querySelector('form');
  await act(async () => form?.requestSubmit());
}

describe('EnquiryForm', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  test('blocks an empty submit, paints errors, and captures the missing fields', async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await renderForm(root);

    await submit();

    expect(fetchStub).not.toHaveBeenCalled();
    expect(captureEvent).toHaveBeenCalledWith('contact_submit_blocked', {
      missingFields: ['name', 'email', 'message'],
    });
    expect(container.querySelector('#contact-name-error')?.textContent).toBe('Please enter your name');
    expect(container.querySelector('#contact-email-error')?.textContent).toBe('Please enter your email address');
    expect(container.querySelector('#contact-message-error')?.textContent).toBe('Please enter a message');
  });

  test('sends a completed form without a blocked event', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchStub);

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await renderForm(root);

    field('name').value = 'Ann';
    field('email').value = 'ann@example.com';
    field('message').value = 'Hello';

    await submit();

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(captureEvent).not.toHaveBeenCalledWith('contact_submit_blocked', expect.anything());
  });
});
