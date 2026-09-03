import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  Keyboard: {},
  Platform: { OS: 'ios' },
}));

import { assistantKeyboardBottomPadding, assistantKeyboardInitialBottomPadding } from './assistant-keyboard';

describe('assistantKeyboardBottomPadding', () => {
  test('removes the safe-area padding already applied below the composer', () => {
    expect(assistantKeyboardBottomPadding(335, 34, 'ios')).toBe(301);
  });

  test('keeps the full reported Android keyboard height', () => {
    expect(assistantKeyboardBottomPadding(252, 24, 'android')).toBe(252);
  });

  test('does not produce negative padding', () => {
    expect(assistantKeyboardBottomPadding(20, 34, 'ios')).toBe(0);
  });
});

describe('assistantKeyboardInitialBottomPadding', () => {
  test('does not read unavailable native keyboard metrics on web', () => {
    expect(assistantKeyboardInitialBottomPadding(0, 'web')).toBe(0);
  });
});
