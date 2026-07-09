import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  type PartState,
  ThreadPrimitive,
  type ToolCallMessagePartProps,
  useAuiState,
} from '@assistant-ui/react';
import { IconArrowDown, IconArrowUp, IconCopy, IconRefresh, IconSquare } from '@tabler/icons-react';
import type { FC, ReactNode } from 'react';

import { getRunUsageFromMetadata } from '@/components/assistant-ui/assistant-run-usage.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { ScrollAreaRoot, ScrollAreaViewport, ScrollBar } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';

import { useAssistantDebugEnabled } from './assistant-debug-state.js';
import { MarkdownText } from './markdown-text.js';
import { TooltipIconButton } from './tooltip-icon-button.js';

type ThreadProps = {
  composerSlot?: ReactNode;
};

export const Thread: FC<ThreadProps> = ({ composerSlot }) => {
  return (
    <ScrollAreaRoot
      render={<ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-background" />}
    >
      <ScrollAreaViewport
        render={
          <ThreadPrimitive.Viewport
            className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden scroll-smooth"
            turnAnchor="top"
          />
        }
      >
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col px-4 pt-4">
          <AuiIf condition={(state) => state.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div className="flex w-full min-w-0 flex-col gap-6 pb-8">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pb-4">
            <ThreadScrollToBottom />
            <Composer composerSlot={composerSlot} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ScrollAreaViewport>
      <ScrollBar />
    </ScrollAreaRoot>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);

  return role === 'user' ? <UserMessage /> : <AssistantMessage />;
};

const ThreadWelcome: FC = () => {
  return (
    <div className="my-auto flex min-h-72 flex-col justify-center px-2">
      <div>
        <h1 className="font-semibold text-2xl">Assistant</h1>
        <p className="text-muted-foreground text-sm">Conversations are saved locally in this browser.</p>
      </div>
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={
        <TooltipIconButton
          className="absolute -top-12 self-center rounded-full bg-background shadow-sm disabled:invisible"
          tooltip="Scroll to bottom"
          variant="outline"
        >
          <IconArrowDown />
        </TooltipIconButton>
      }
    />
  );
};

const Composer: FC<ThreadProps> = ({ composerSlot }) => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
      {composerSlot}
      <div className="flex w-full flex-col gap-2 rounded-lg border bg-background p-2 shadow-sm focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20">
        <ComposerPrimitive.Input
          aria-label="Message"
          autoFocus
          className="max-h-36 min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Message the assistant"
          rows={2}
        />
        <div className="flex items-center justify-end gap-2">
          <AuiIf condition={(state) => state.thread.isRunning}>
            <ComposerPrimitive.Cancel
              render={
                <Button aria-label="Stop generating" size="icon-sm" type="button" variant="outline">
                  <IconSquare className="fill-current" />
                </Button>
              }
            />
          </AuiIf>
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send
              render={
                <Button aria-label="Send message" size="icon-sm" type="button">
                  <IconArrowUp />
                </Button>
              }
            />
          </AuiIf>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="group/message relative w-full min-w-0">
      <div className="min-w-0 px-2 text-sm leading-6">
        <MessagePrimitive.GroupedParts groupBy={groupToolCallParts}>
          {({ part, children }) => {
            if (part.type === 'group-tool-calls') {
              return <ToolCallGroup count={part.indices.length}>{children}</ToolCallGroup>;
            }

            if (part.type === 'text') {
              if (part.status?.type === 'running' && part.text.length === 0) {
                return <ThinkingText />;
              }

              return <MarkdownText />;
            }

            if (part.type === 'tool-call') {
              return <ToolCallDetail {...part} />;
            }

            return null;
          }}
        </MessagePrimitive.GroupedParts>
        <AssistantThinking />
        <AssistantUsageFooter />
        <MessageError />
      </div>
      <div className="h-9 pt-1">
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantUsageFooter: FC = () => {
  const debugEnabled = useAssistantDebugEnabled();
  const runUsage = useAuiState((state) =>
    state.message.role === 'assistant' ? getRunUsageFromMetadata(state.message.metadata?.custom) : undefined,
  );

  if (!debugEnabled || !runUsage) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
      <span>{formatTokenCount(runUsage.inputTokens)} in</span>
      <span aria-hidden="true">·</span>
      <span>{formatTokenCount(runUsage.outputTokens)} out</span>
      <span aria-hidden="true">·</span>
      <span>{formatTokenCount(runUsage.reasoningOutputTokens)} reasoning</span>
      <span aria-hidden="true">·</span>
      <span>{formatTokenCount(runUsage.cachedInputTokens)} cached</span>
      <span aria-hidden="true">·</span>
      <span>{runUsage.requests} requests</span>
    </div>
  );
};

const AssistantThinking: FC = () => {
  const isThinking = useAuiState(
    (state) =>
      state.message.status?.type === 'running' &&
      !state.message.parts.some((part) => part.type === 'text' && part.text.length > 0),
  );

  return isThinking ? <ThinkingText /> : null;
};

const ThinkingText: FC = () => {
  return (
    <div>
      <span className="inline-flex bg-[linear-gradient(110deg,var(--muted-foreground)_0%,var(--muted-foreground)_35%,var(--foreground)_50%,var(--muted-foreground)_65%,var(--muted-foreground)_100%)] bg-[length:220%_100%] bg-clip-text text-sm text-transparent [animation:assistant-thinking-shimmer_1.6s_linear_infinite]">
        Thinking...
      </span>
    </div>
  );
};

const groupToolCallParts = (part: PartState): readonly ['group-tool-calls'] | null => {
  return part.type === 'tool-call' ? ['group-tool-calls'] : null;
};

const ToolCallGroup: FC<{ children: ReactNode; count: number }> = ({ children, count }) => {
  return (
    <div className="mb-3 inline-flex max-w-full pe-2">
      <HoverCard>
        <HoverCardTrigger
          render={
            <Badge
              className="max-w-full cursor-default truncate border-border/70 bg-muted/30 px-2 py-0.5 font-normal text-muted-foreground text-xs"
              variant="outline"
            >
              tool calls {count}
            </Badge>
          }
        />
        <HoverCardContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-2" side="top">
          <div className="divide-y divide-border/70">{children}</div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
};

const ToolCallDetail: FC<ToolCallMessagePartProps> = ({ result, status, toolName }) => {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2 text-xs first:pt-1 last:pb-1">
      <span className="truncate font-medium text-foreground">{toolName}</span>
      <span className="shrink-0 text-muted-foreground">{formatToolStatus(status.type, result)}</span>
    </div>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      className="ms-1 flex items-center gap-1 text-muted-foreground"
      hideWhenRunning
    >
      <ActionBarPrimitive.Copy
        render={
          <TooltipIconButton tooltip="Copy">
            <IconCopy />
          </TooltipIconButton>
        }
      />
      <ActionBarPrimitive.Reload
        render={
          <TooltipIconButton tooltip="Refresh">
            <IconRefresh />
          </TooltipIconButton>
        }
      />
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="block w-full min-w-0 px-2">
      <div className="ml-auto w-fit min-w-0 max-w-[min(42rem,85%)] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm leading-6">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
        <ErrorPrimitive.Message className={cn('line-clamp-2')} />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

function formatToolStatus(status: string, result: unknown): string {
  if (status === 'running') {
    return 'running';
  }

  if (status === 'incomplete') {
    return 'failed';
  }

  const count = getResultCount(result);

  if (count !== null) {
    return `${count} result${count === 1 ? '' : 's'}`;
  }

  return 'done';
}

function getResultCount(result: unknown): number | null {
  if (isRecord(result) && Array.isArray(result.items)) {
    return result.items.length;
  }

  if (isRecord(result) && typeof result.total === 'number') {
    return result.total;
  }

  if (Array.isArray(result)) {
    return result.length;
  }

  return null;
}

function formatTokenCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
