import { describe, expect, test, vi } from 'vitest';

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    clearError: vi.fn(),
    error: null,
    messages: [],
    regenerate: vi.fn(),
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
  }),
}));
vi.mock('@tabler/icons-react-native', () => ({ IconPlus: 'IconPlus', IconX: 'IconX' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));
vi.mock('@/components/assistant/AssistantProvider', () => ({
  useAssistant: () => ({ chat: {}, reset: vi.fn() }),
}));
vi.mock('@/components/ui/chat-ai', () => ({ Conversation: 'Conversation', PromptInput: 'PromptInput' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/lib/assistant-keyboard', () => ({ useAssistantKeyboardBottomPadding: () => 301 }));

import AssistantRoute from '../../../app/(protected)/assistant';

describe('AssistantRoute keyboard layout', () => {
  test('applies the measured keyboard inset to the modal content', () => {
    const route = AssistantRoute();
    const keyboardAwareContent = route.props.children;

    expect(keyboardAwareContent.type).toBe('View');
    expect(keyboardAwareContent.props.style).toEqual({ paddingBottom: 301 });
  });
});
