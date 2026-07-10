import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
  useAuiState,
} from '@assistant-ui/react';
import { IconArrowDown, IconArrowUp, IconCopy, IconRefresh, IconSquare } from '@tabler/icons-react';
import type { FC } from 'react';

import { Button } from '@/components/ui/button.js';
import { ScrollAreaRoot, ScrollAreaViewport, ScrollBar } from '@/components/ui/scroll-area.js';

import { MarkdownText } from './markdown-text.js';
import { ToolFallback } from './tool-fallback.js';
import { TooltipIconButton } from './tooltip-icon-button.js';

// Vanilla assistant-ui thread for the floating modal. Runs on the AI SDK v6 runtime and renders
// standard message parts — text through the v2 MarkdownText (keeps domain entity-link nav) and
// tool calls through the stock ToolFallback. Kept close to the assistant-ui reference thread.
export const ModalThread: FC = () => {
  return (
    <ScrollAreaRoot render={<ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background" />}>
      <ScrollAreaViewport
        render={
          <ThreadPrimitive.Viewport
            className="relative flex h-full min-h-0 flex-1 flex-col overflow-x-hidden scroll-smooth px-3 pt-3"
            turnAnchor="top"
          />
        }
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <div className="flex flex-1 flex-col gap-4">
          <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-background pb-3">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
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
    <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
      <h1 className="font-semibold text-lg">How can I help you today?</h1>
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={
        <TooltipIconButton
          className="absolute -top-10 self-center rounded-full bg-background shadow-sm disabled:invisible"
          tooltip="Scroll to bottom"
          variant="outline"
        >
          <IconArrowDown />
        </TooltipIconButton>
      }
    />
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="relative flex w-full flex-col rounded-lg border bg-background p-2 shadow-sm focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20">
      <ComposerPrimitive.Input
        aria-label="Message"
        autoFocus
        className="max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Send a message..."
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
    </ComposerPrimitive.Root>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative w-full">
      <div className="px-1 text-sm leading-6">
        <MessagePrimitive.Parts components={{ Text: MarkdownText, tools: { Fallback: SpacedToolFallback } }} />
        <MessageError />
      </div>
      <AssistantActionBar />
    </MessagePrimitive.Root>
  );
};

// Adds a little breathing room below the tool call, and pretty-prints the tool input so it reads
// like the result JSON (the runtime hands `argsText` over as a compact single line).
const SpacedToolFallback: ToolCallMessagePartComponent = (props) => (
  <div className="mb-3">
    <ToolFallback {...props} argsText={prettyPrintJson(props.argsText)} />
  </div>
);

// While the call is still streaming the args text can be partial/unparseable — fall back to it as-is.
function prettyPrintJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      autohide="not-last"
      className="mt-1 flex items-center gap-1 px-1 text-muted-foreground"
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
    <MessagePrimitive.Root className="w-full px-1">
      <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm leading-6">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2.5 text-destructive text-sm">
        <ErrorPrimitive.Message className="line-clamp-3" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};
