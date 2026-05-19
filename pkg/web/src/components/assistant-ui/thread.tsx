import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, RefreshCwIcon, SquareIcon } from 'lucide-react';
import type { FC } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

import { MarkdownText } from './markdown-text.js';
import { TooltipIconButton } from './tooltip-icon-button.js';

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-background">
      <ThreadPrimitive.Viewport
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth"
        turnAnchor="top"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4">
          <AuiIf condition={(state) => state.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div className="flex flex-col gap-6 pb-8">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pb-4">
            <ThreadScrollToBottom />
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);

  return role === 'user' ? <UserMessage /> : <AssistantMessage />;
};

const ThreadWelcome: FC = () => {
  return (
    <div className="my-auto flex min-h-72 flex-col justify-center px-2">
      <h1 className="font-semibold text-2xl">Assistant</h1>
      <p className="text-muted-foreground text-sm">Conversations are saved locally in this browser.</p>
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
          <ArrowDownIcon />
        </TooltipIconButton>
      }
    />
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col">
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
                  <SquareIcon className="fill-current" />
                </Button>
              }
            />
          </AuiIf>
          <AuiIf condition={(state) => !state.thread.isRunning}>
            <ComposerPrimitive.Send
              render={
                <Button aria-label="Send message" size="icon-sm" type="button">
                  <ArrowUpIcon />
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
    <MessagePrimitive.Root className="group/message relative min-w-0">
      <div className="min-w-0 px-2 text-sm leading-6">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === 'text') {
              if (part.status?.type === 'running' && part.text.length === 0) {
                return <div className="text-muted-foreground">Thinking...</div>;
              }

              return <MarkdownText />;
            }

            if (part.type === 'tool-call') {
              return (
                <div className="mb-3 inline-flex max-w-full pe-2">
                  <ToolCallBadge result={part.result} status={part.status.type} toolName={part.toolName} />
                </div>
              );
            }

            return null;
          }}
        </MessagePrimitive.Parts>
        <MessageError />
      </div>
      <AssistantActionBar />
    </MessagePrimitive.Root>
  );
};

const ToolCallBadge: FC<{
  result: unknown;
  status: string;
  toolName: string;
}> = ({ result, status, toolName }) => {
  return (
    <Badge className="max-w-full truncate border-primary/50 bg-primary/20 px-3 py-1 text-foreground" variant="outline">
      tool call - {toolName}: {formatToolStatus(status, result)}
    </Badge>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      className="ms-1 mt-1 flex items-center gap-1 text-muted-foreground"
      hideWhenRunning
    >
      <ActionBarPrimitive.Copy
        render={
          <TooltipIconButton tooltip="Copy">
            <CopyIcon />
          </TooltipIconButton>
        }
      />
      <ActionBarPrimitive.Reload
        render={
          <TooltipIconButton tooltip="Refresh">
            <RefreshCwIcon />
          </TooltipIconButton>
        }
      />
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="grid min-w-0 grid-cols-[minmax(4rem,1fr)_auto] px-2">
      <div className="col-start-2 min-w-0 max-w-[min(42rem,85%)] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm leading-6">
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
  if (isRecord(result) && typeof result.total === 'number') {
    return result.total;
  }

  if (isRecord(result) && Array.isArray(result.items)) {
    return result.items.length;
  }

  if (Array.isArray(result)) {
    return result.length;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
