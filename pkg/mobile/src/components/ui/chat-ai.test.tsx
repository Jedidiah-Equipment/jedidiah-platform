import type { ReactElement } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: null }),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('@tabler/icons-react-native', () => ({
  IconArrowUp: 'IconArrowUp',
  IconPlayerStopFilled: 'IconPlayerStopFilled',
}));
vi.mock('react-native-markdown-display', () => ({ default: 'Markdown' }));
vi.mock('@/components/assistant/assistant-markdown-link', () => ({ AssistantMarkdownLink: 'AssistantMarkdownLink' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/theme/brand-colors', () => ({ loadingSpinnerColor: '#fff', primaryColorTriplets: { dark: '0 0 0' } }));
vi.mock('@/theme/gluestack-config', () => ({
  foregroundColors: { dark: '#fff' },
  mutedColors: { dark: '#000' },
  navigationColors: { dark: { border: '#000', mutedForeground: '#777' } },
}));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'dark' }) }));

import { Conversation } from './chat-ai';

describe('Conversation keyboard dismissal', () => {
  test('keeps an interactive list surface when the conversation is empty', () => {
    const conversation = Conversation({ messages: [] }) as ReactElement<{
      alwaysBounceVertical?: boolean;
      keyboardDismissMode?: string;
      keyboardShouldPersistTaps?: string;
    }>;

    expect(conversation.type).toBe('FlatList');
    expect(conversation.props.alwaysBounceVertical).toBe(true);
    expect(conversation.props.keyboardDismissMode).toBe('interactive');
    expect(conversation.props.keyboardShouldPersistTaps).toBe('never');
  });
});
