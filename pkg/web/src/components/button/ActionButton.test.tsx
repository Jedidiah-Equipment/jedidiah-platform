// @vitest-environment jsdom

import { presentAction } from '@pkg/domain';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionButton, type PresentedAction } from './ActionButton.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const refusal = 'This Job is Priced, so you can no longer cancel the Job.';
const allowed = presentAction({ allowed: true }) as PresentedAction;
const refused = presentAction({ allowed: false, reason: 'wrong-status', message: refusal }) as PresentedAction;

function render(action: PresentedAction, disabled?: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  act(() =>
    root.render(
      <ActionButton action={action} disabled={disabled}>
        Cancel job
      </ActionButton>,
    ),
  );
  const button = container.querySelector('button') as HTMLButtonElement;
  const describedBy = (element: Element | null) =>
    document.getElementById(element?.getAttribute('aria-describedby') ?? '')?.textContent ?? null;
  return { button, container, describedBy };
}

describe('ActionButton', () => {
  it('renders an allowed action as a plain enabled button', () => {
    const { button, container } = render(allowed);

    expect(button.disabled).toBe(false);
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
  });

  it('puts a refused action’s reason on a focusable tooltip trigger and in the accessible description', () => {
    const { button, container, describedBy } = render(refused);
    const trigger = container.querySelector('[data-slot="tooltip-trigger"]');

    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('title')).toBe(false);
    expect(trigger?.getAttribute('tabindex')).toBe('0');
    expect(trigger?.contains(button)).toBe(true);
    expect(describedBy(trigger)).toBe(refusal);
    expect(describedBy(button)).toBe(refusal);
  });

  it('adds a local condition without a reason of its own', () => {
    const { button, container } = render(allowed, true);

    expect(button.disabled).toBe(true);
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
  });

  it('keeps the verdict’s reason when a local condition also disables it', () => {
    const { button, describedBy } = render(refused, true);

    expect(button.disabled).toBe(true);
    expect(describedBy(button)).toBe(refusal);
  });
});
