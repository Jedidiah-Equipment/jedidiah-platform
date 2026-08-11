// @vitest-environment jsdom

import { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Footer } from './footer.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const analytics = vi.hoisted(() => ({
  captureEvent: vi.fn(),
  captureEventForNavigation: vi.fn(),
  isInternalUser: vi.fn(() => false),
  setInternalUser: vi.fn((internal: boolean) => internal),
}));

vi.mock('../lib/analytics.js', () => analytics);

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

vi.mock('./dung-beetle.js', () => ({
  DungBeetle: ({ onClick }: { onClick: MouseEventHandler<HTMLButtonElement> }) => (
    <button type="button" data-testid="dung-beetle" onClick={onClick} />
  ),
}));

describe('Footer', () => {
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  test('toggles the internal-user flag after six rapid beetle clicks', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Footer ranges={[]} />));

    const beetle = container.querySelector('[data-testid="dung-beetle"]');
    if (!(beetle instanceof HTMLButtonElement)) {
      throw new Error('missing dung beetle');
    }

    for (let click = 0; click < 5; click += 1) {
      await act(async () => beetle.click());
    }
    expect(analytics.setInternalUser).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Internal User: Posthog Disabled');

    await act(async () => beetle.click());
    expect(analytics.setInternalUser).toHaveBeenLastCalledWith(true);
    expect(container.textContent).toContain('Internal User: Posthog Disabled');

    for (let click = 0; click < 6; click += 1) {
      await act(async () => beetle.click());
    }
    expect(analytics.setInternalUser).toHaveBeenLastCalledWith(false);
    expect(container.textContent).not.toContain('Internal User: Posthog Disabled');
  });

  test('shows the disabled message for a persisted internal user', async () => {
    analytics.isInternalUser.mockReturnValueOnce(true);
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root?.render(<Footer ranges={[]} />));

    expect(container.textContent).toContain('Internal User: Posthog Disabled');
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
