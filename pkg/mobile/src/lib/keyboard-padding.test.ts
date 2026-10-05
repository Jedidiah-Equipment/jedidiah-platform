import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  Keyboard: {},
  Platform: { OS: 'ios' },
}));

import { keyboardBottomPadding, keyboardInitialBottomPadding } from './keyboard-padding';

describe('keyboardBottomPadding', () => {
  test('removes the safe-area padding already applied below the composer', () => {
    expect(keyboardBottomPadding(335, 34, 'ios')).toBe(301);
  });

  test('keeps the full reported Android keyboard height', () => {
    expect(keyboardBottomPadding(252, 24, 'android')).toBe(252);
  });

  test('does not produce negative padding', () => {
    expect(keyboardBottomPadding(20, 34, 'ios')).toBe(0);
  });
});

describe('keyboardInitialBottomPadding', () => {
  test('does not read unavailable native keyboard metrics on web', () => {
    expect(keyboardInitialBottomPadding(0, 'web')).toBe(0);
  });
});
