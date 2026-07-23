import { useChat } from '@ai-sdk/react';
import { IconPlus, IconX } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistant } from '@/components/assistant/AssistantProvider';
import { Conversation, PromptInput } from '@/components/ui/chat-ai';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export default function AssistantRoute() {
  const router = useRouter();
  const { chat, reset } = useAssistant();
  const { clearError, error, messages, regenerate, sendMessage, status, stop } = useChat({ chat });
  const isStreaming = status === 'submitted' || status === 'streaming';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center gap-3 border-b border-border bg-background px-4 py-3">
          <Pressable
            accessibilityLabel="Close Assistant"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
            onPress={() => router.back()}
          >
            <Icon icon={IconX} size={20} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-base leading-5 text-foreground" weight="bold">
              Assistant
            </Text>
            <Text className="text-xs text-muted-foreground">Acts with your permissions</Text>
          </View>
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
          disabled={status !== 'ready'}
          isStreaming={isStreaming}
          onStop={() => void stop()}
          onSubmit={(text) => void sendMessage({ text })}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
