import { AssistantRuntimeProvider, Suggestions, useAui, useAuiState, useLocalRuntime } from '@assistant-ui/react';
import { IconMessage, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Thread } from '@/components/assistant-ui/thread.js';
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';

import {
  createAssistantChatHistoryAdapter,
  getSortedAssistantChats,
  useAssistantChatStore,
} from './assistant-chat-store.js';
import { jedidiahChatAdapter } from './assistant-ui-adapter.js';

export const ASSISTANT_EXAMPLE_QUESTIONS: string[] = [
  'how is the job for Thaba Mining Supplies going?',
  'show me quotes waiting for customer approval',
  'which jobs are behind schedule?',
  'what work is active in Production?',
  'find recent audit activity for quote changes',
  'which customers have open jobs?',
];

export function AssistantPanel() {
  const { activeChatId, activeChat } = useAssistantChatStore(
    useShallow((state) => ({
      activeChat: state.chats[state.activeChatId],
      activeChatId: state.activeChatId,
    })),
  );

  useEffect(() => {
    if (!activeChat) {
      useAssistantChatStore.getState().createChat();
    }
  }, [activeChat]);

  if (!activeChat) {
    return null;
  }

  return <AssistantRuntimeSession key={activeChatId} activeChatId={activeChatId} />;
}

function AssistantRuntimeSession({ activeChatId }: { activeChatId: string }) {
  const aui = useAui({
    suggestions: Suggestions(ASSISTANT_EXAMPLE_QUESTIONS),
  });
  const history = useMemo(() => createAssistantChatHistoryAdapter(activeChatId), [activeChatId]);
  const runtime = useLocalRuntime(jedidiahChatAdapter, {
    adapters: {
      history,
    },
  });

  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      <AssistantChatFrame />
    </AssistantRuntimeProvider>
  );
}

function AssistantChatFrame() {
  const { activeChatId, chatRecords, deleteChat, newChat, selectChat } = useAssistantChatStore(
    useShallow((state) => ({
      activeChatId: state.activeChatId,
      chatRecords: state.chats,
      deleteChat: state.deleteChat,
      newChat: state.newChat,
      selectChat: state.selectChat,
    })),
  );
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const chats = useMemo(() => getSortedAssistantChats(chatRecords), [chatRecords]);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-1 gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-lg border bg-background">
        <div className="border-b p-2">
          <Button
            className="w-full justify-start text-sm!"
            disabled={isRunning}
            onClick={() => newChat()}
            type="button"
            variant="outline"
          >
            <IconPlus />
            New Chat
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2">
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;

              return (
                <div
                  className={cn(
                    'group flex h-9 min-w-0 items-center rounded-md transition-colors hover:bg-muted',
                    isActive && 'bg-muted',
                  )}
                  key={chat.id}
                >
                  <button
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm! outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
                      isActive && 'font-medium',
                    )}
                    disabled={isRunning}
                    onClick={() => selectChat(chat.id)}
                    type="button"
                  >
                    <IconMessage className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <TooltipIconButton
                    className="mr-1 size-7 text-muted-foreground opacity-70 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={isRunning}
                    onClick={() => deleteChat(chat.id)}
                    side="right"
                    tooltip="Delete chat"
                    type="button"
                  >
                    <IconTrash />
                  </TooltipIconButton>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
      <Thread />
    </div>
  );
}
