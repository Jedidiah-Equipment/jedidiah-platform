import { IconArrowUp, IconPlayerStopFilled } from '@tabler/icons-react-native';
import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItem, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Markdown, { type ASTNode, type RenderRules } from 'react-native-markdown-display';

import { AssistantMarkdownLink } from '@/components/assistant/assistant-markdown-link';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { loadingSpinnerColor, primaryColorTriplets } from '@/theme/brand-colors';
import { foregroundColors, mutedColors, navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

export function Conversation({ messages }: { messages: UIMessage[] }) {
  const listRef = useRef<FlatList<UIMessage>>(null);
  const renderItem: ListRenderItem<UIMessage> = ({ item }) => <Message message={item} />;

  return (
    <FlatList
      ref={listRef}
      // Keep an interactive scroll surface even before the first message so an
      // empty chat can dismiss the iOS keyboard with a tap or downward drag.
      alwaysBounceVertical
      contentContainerClassName={messages.length === 0 ? 'flex-grow px-8' : 'gap-4 px-4 py-5'}
      data={messages}
      keyExtractor={(message) => message.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps={messages.length === 0 ? 'never' : 'handled'}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-center text-xl text-foreground" weight="bold">
            How can I help?
          </Text>
          <Text className="text-center text-sm leading-5 text-muted-foreground">
            Ask about Customers, Products, Quotes, Jobs, or work you have permission to complete.
          </Text>
        </View>
      }
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
    />
  );
}

export function Message({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <View className={isUser ? 'items-end' : 'items-start'}>
      <View className={isUser ? 'max-w-[88%] rounded-3xl bg-muted px-4 py-3' : 'w-full px-1 py-1'}>
        <MessageResponse message={message} />
      </View>
    </View>
  );
}

export function MessageResponse({ message }: { message: UIMessage }) {
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];
  const foreground = foregroundColors[resolved];
  const codeBackground = mutedColors[resolved];
  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: { color: foreground, fontFamily: 'Geist', fontSize: 15, lineHeight: 22 },
        blockquote: { borderLeftColor: colors.border, borderLeftWidth: 3, paddingLeft: 10 },
        code_block: {
          backgroundColor: codeBackground,
          borderRadius: 10,
          color: foreground,
          fontFamily: 'monospace',
          padding: 12,
        },
        code_inline: {
          backgroundColor: codeBackground,
          borderRadius: 4,
          color: foreground,
          fontFamily: 'monospace',
        },
        fence: {
          backgroundColor: codeBackground,
          borderRadius: 10,
          color: foreground,
          fontFamily: 'monospace',
          padding: 12,
        },
        heading1: { color: foreground, fontFamily: 'Geist-Bold', fontSize: 22, lineHeight: 28 },
        heading2: { color: foreground, fontFamily: 'Geist-Bold', fontSize: 19, lineHeight: 25 },
        link: { color: `rgb(${primaryColorTriplets[resolved]})` },
        paragraph: { marginBottom: 8, marginTop: 0 },
        text: { color: foreground, fontFamily: 'Geist', fontSize: 15, lineHeight: 22 },
      }),
    [codeBackground, colors.border, foreground, resolved],
  );
  const rules = useMemo<RenderRules>(
    () => ({
      link: (node: ASTNode, children: ReactNode[]) => (
        <AssistantMarkdownLink href={String(node.attributes.href ?? '')} key={node.key}>
          {children}
        </AssistantMarkdownLink>
      ),
    }),
    [],
  );

  const visibleParts = message.parts.filter(
    (part) => (part.type === 'text' && part.text.trim().length > 0) || isToolPart(part),
  );

  if (visibleParts.length === 0) {
    return <Text className="text-sm text-muted-foreground">Thinking…</Text>;
  }

  return (
    <View className="gap-2">
      {visibleParts.map((part, index) => {
        if (part.type === 'text') {
          return (
            // The AI SDK text-part protocol preserves array order but does not assign part IDs.
            // biome-ignore lint/suspicious/noArrayIndexKey: There is no more stable unique key for streaming text parts.
            <Markdown key={`${message.id}-text-${index}`} rules={rules} style={markdownStyles}>
              {part.text}
            </Markdown>
          );
        }

        return <ToolActivity key={toolPartKey(part, index)} part={part} />;
      })}
    </View>
  );
}

export function PromptInput({
  disabled,
  isStreaming,
  onStop,
  onSubmit,
}: {
  disabled: boolean;
  isStreaming: boolean;
  onStop: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const { resolved } = useColorMode();
  const value = text.trim();

  const handleSubmit = () => {
    if (!value || disabled) return;
    setText('');
    onSubmit(value);
  };

  return (
    <View className="border-t border-border bg-background px-4 pb-3 pt-3">
      <View className="mx-auto w-full max-w-[760px] flex-row items-end gap-2 rounded-3xl border border-border bg-surface p-2 pl-4">
        <TextInput
          accessibilityLabel="Message the Assistant"
          className="max-h-32 min-h-10 flex-1 font-sans text-[15px] leading-5 text-foreground"
          multiline
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          placeholder="Message the Assistant"
          placeholderTextColor={navigationColors[resolved].mutedForeground}
          returnKeyType="send"
          value={text}
        />
        {isStreaming ? (
          <Pressable
            accessibilityLabel="Stop response"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
            onPress={onStop}
          >
            <Icon className="text-primary-foreground" icon={IconPlayerStopFilled} size={16} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            className={`h-10 w-10 items-center justify-center rounded-full bg-primary ${
              disabled || !value ? 'opacity-40' : 'active:opacity-80'
            }`}
            disabled={disabled || !value}
            onPress={handleSubmit}
          >
            <Icon className="text-primary-foreground" icon={IconArrowUp} size={19} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ToolActivity({ part }: { part: ToolPart }) {
  const pending = part.state === 'input-streaming' || part.state === 'input-available';
  const failed = part.state === 'output-error';

  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      {pending ? <ActivityIndicator color={loadingSpinnerColor} size="small" /> : null}
      <Text className={failed ? 'text-xs text-danger' : 'text-xs text-muted-foreground'} mono>
        {failed ? 'Failed: ' : pending ? 'Using ' : 'Used '}
        {formatToolName(toolName(part))}
      </Text>
    </View>
  );
}

type ToolPart = UIMessage['parts'][number] & {
  state?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
};

function isToolPart(part: UIMessage['parts'][number]): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function toolName(part: ToolPart): string {
  return part.type === 'dynamic-tool' ? (part.toolName ?? 'tool') : part.type.slice('tool-'.length);
}

function toolPartKey(part: ToolPart, index: number): string {
  return part.toolCallId ?? `${part.type}-${index}`;
}

function formatToolName(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
