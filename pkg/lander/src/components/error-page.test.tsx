// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { LanderErrorPage } from './error-page.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const invalidate = vi.hoisted(() => vi.fn());
const localeMatch = vi.hoisted(() => ({ current: undefined as { context: { locale: string } } | undefined }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useMatch: () => localeMatch.current,
  useRouter: () => ({ invalidate }),
}));

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = undefined;
  localeMatch.current = undefined;
  vi.clearAllMocks();
});

async function render() {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root?.render(<LanderErrorPage />));
  return container;
}

describe('LanderErrorPage', () => {
  test('shows the branded error copy and retries the route on click', async () => {
    localeMatch.current = { context: { locale: 'en' } };

    const container = await render();

    expect(container.textContent).toContain('This page did not load');
    const retry = container.querySelector('button');
    expect(retry?.textContent).toContain('Try Again');

    await act(async () => retry?.click());
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test('renders in the matched locale', async () => {
    localeMatch.current = { context: { locale: 'af' } };

    const container = await render();

    expect(container.textContent).toContain('Hierdie bladsy het nie gelaai nie');
  });

  // A root or locale-layout loader failure renders this above the LocaleProvider, so there is no locale
  // match. It must still render in the Canonical Locale rather than crash on missing context.
  test('falls back to the Canonical Locale when no locale layout is mounted', async () => {
    localeMatch.current = undefined;

    const container = await render();

    expect(container.textContent).toContain('This page did not load');
  });
});
