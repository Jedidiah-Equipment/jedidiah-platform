import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@/components/BrandHeader', () => ({ BrandHeader: 'BrandHeader' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { ForgotPasswordScreen } from './ForgotPasswordScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderScreen(requestReset: (email: string) => Promise<void>): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ForgotPasswordScreen onBack={vi.fn()} requestReset={requestReset} />);
  });
  return renderer;
}

function enterEmail(renderer: ReactTestRenderer, email: string): void {
  act(() => {
    renderer.root.findByType('TextInput' as never).props.onChangeText(email);
  });
}

async function submit(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    await renderer.root.findByProps({ accessibilityLabel: 'Send reset link' }).props.onPress();
  });
}

describe('ForgotPasswordScreen', () => {
  test('requests a reset and replaces the form with a non-enumerating confirmation', async () => {
    const requestReset = vi.fn().mockResolvedValue(undefined);
    const renderer = renderScreen(requestReset);

    enterEmail(renderer, '  PERSON@EXAMPLE.COM  ');
    await submit(renderer);

    expect(requestReset).toHaveBeenCalledWith('person@example.com');
    expect(JSON.stringify(renderer.toJSON())).toContain('Check your email');
    expect(renderer.root.findAllByType('TextInput' as never)).toHaveLength(0);
  });

  test('rejects an invalid email before crossing the reset boundary', async () => {
    const requestReset = vi.fn().mockResolvedValue(undefined);
    const renderer = renderScreen(requestReset);

    enterEmail(renderer, 'not-an-email');
    await submit(renderer);

    expect(requestReset).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain('Enter a valid email address.');
  });
});
