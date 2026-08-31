import AsyncStorage from '@react-native-async-storage/async-storage';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseColorModePreference, resolveColorModePreference } from './color-mode';

const setColorScheme = vi.fn();
vi.mock('nativewind', () => ({ colorScheme: { set: (scheme: string) => setColorScheme(scheme) } }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'ios' },
  Text: 'Text',
  View: 'View',
}));
vi.mock('./brand-colors', () => ({ loadingSpinnerColor: '#fff000' }));

import { ColorModeProvider } from './ColorModeProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('resolveColorModePreference', () => {
  it('uses explicit light and dark preferences', () => {
    expect(resolveColorModePreference('light')).toBe('light');
    expect(resolveColorModePreference('dark')).toBe('dark');
  });
});

describe('parseColorModePreference', () => {
  it('accepts only explicit light and dark preferences', () => {
    expect(parseColorModePreference('light')).toBe('light');
    expect(parseColorModePreference('dark')).toBe('dark');
  });

  it('defaults missing, invalid, and legacy system values to dark', () => {
    expect(parseColorModePreference(null)).toBe('dark');
    expect(parseColorModePreference('system')).toBe('dark');
    expect(parseColorModePreference('unknown')).toBe('dark');
  });
});

describe('ColorModeProvider', () => {
  beforeEach(async () => {
    setColorScheme.mockClear();
    await AsyncStorage.clear();
  });

  it.each(['light', 'dark'] as const)('hands the %s preference to NativeWind', async (preference) => {
    await AsyncStorage.setItem('jedidiah-color-mode', preference);

    await act(async () => {
      create(createElement(ColorModeProvider, null, null));
    });

    expect(setColorScheme).toHaveBeenLastCalledWith(preference);
  });
});
