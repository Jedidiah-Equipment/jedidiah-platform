import { useChat } from '@ai-sdk/react';
import { IconPlus } from '@tabler/icons-react-native';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAssistant } from '@/equipment/components/assistant/AssistantProvider';
import { Conversation, PromptInput } from '@/equipment/components/assistant/chat-ai';
import { SecondaryPageToolbar } from '@/equipment/components/TopToolbar';
import { useAssistantKeyboardBottomPadding } from '@/equipment/lib/assistant-keyboard';
import { resolveAssistantParent } from '@/equipment/lib/toolbar-navigation';

export default function AssistantRoute() {
  const router = useRouter();
  const { parentHref } = useLocalSearchParams<{ parentHref?: string }>();
  const parent = resolveAssistantParent(parentHref);
  const { chat, reset } = useAssistant();
  const { clearError, error, messages, regenerate, sendMessage, status, stop } = useChat({ chat });
  const isStreaming = status === 'submitted' || status === 'streaming';
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const keyboardBottomPadding = useAssistantKeyboardBottomPadding(safeAreaBottom);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-1" style={{ paddingBottom: keyboardBottomPadding }}>
        <SecondaryPageToolbar
          onBack={() => router.dismissTo(parent.href as Href)}
          parentLabel={parent.label}
          subtitle="ACTS WITH YOUR PERMISSIONS"
          title="Assistant"
        />
        <View className="items-end px-4 pt-3">
          <Pressable
            accessibilityLabel="New chat"
            accessibilityRole="button"
            className="h-10 flex-row items-center gap-1.5 rounded-xl border border-border bg-surface px-3 active:bg-muted"
            onPress={reset}
          >
            <Icon className="text-muted-foreground" icon={IconPlus} size={17} />
            <Text className="text-xs text-foreground" weight="semibold">
              New chat
            </Text>
          </Pressable>
        </View>

        <Conversation messages={messages} />

        {error ? (
          <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5">
            <Text className="min-w-0 flex-1 text-xs leading-5 text-danger">
              {error.message || 'The response was interrupted. Try again.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="rounded-lg border border-danger/40 px-3 py-1.5 active:bg-danger/10"
              onPress={() => {
                clearError();
                void regenerate();
              }}
            >
              <Text className="text-xs text-danger" weight="semibold">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        <PromptInput
          disabled={isStreaming}
          isStreaming={isStreaming}
          onStop={() => void stop()}
          onSubmit={(text) => {
            clearError();
            void sendMessage({ text });
          }}
        />
      </View>
    </SafeAreaView>
  );
}
