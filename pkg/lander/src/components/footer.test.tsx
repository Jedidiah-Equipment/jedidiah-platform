// @vitest-environment jsdom

import { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Footer } from './footer.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    onClick,
  }: {
    children: ReactNode;
    className?: string;
    onClick?: MouseEventHandler;
  }) => (
    <a href="/test" className={className} onClick={onClick}>
      {children}
    </a>
  ),
  useRouterState: () => '/contact',
}));

vi.mock('./dung-beetle.js', () => ({ DungBeetle: () => null }));

describe('Footer language switch', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  test('only stays busy while the current page is navigating', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Footer ranges={[]} />));

    const languageSwitch = container.querySelector('a[aria-busy]');
    if (!(languageSwitch instanceof HTMLAnchorElement)) {
      throw new Error('missing language switch');
    }
    languageSwitch.addEventListener('click', (event) => event.preventDefault());

    await act(async () =>
      languageSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })),
    );
    expect(languageSwitch.getAttribute('aria-busy')).toBe('false');

    await act(async () =>
      languageSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })),
    );
    expect(languageSwitch.getAttribute('aria-busy')).toBe('true');

    await act(async () => window.dispatchEvent(new Event('pageshow')));
    expect(languageSwitch.getAttribute('aria-busy')).toBe('false');
  });
});
