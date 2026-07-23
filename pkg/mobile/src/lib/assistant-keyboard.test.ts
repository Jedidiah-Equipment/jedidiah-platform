import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  Keyboard: {},
  Platform: { OS: 'ios' },
}));

import { assistantKeyboardBottomPadding } from './assistant-keyboard';

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
