import { AssistantRuntimeProvider, useAuiState, useLocalRuntime } from '@assistant-ui/react';
import { MessageSquareIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Thread } from '@/components/assistant-ui/thread.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

import {
  createAssistantChatHistoryAdapter,
  getSortedAssistantChats,
  useAssistantChatStore,
} from './assistant-chat-store.js';
import { jedidiahChatAdapter } from './assistant-ui-adapter.js';

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
  const history = useMemo(() => createAssistantChatHistoryAdapter(activeChatId), [activeChatId]);
  const runtime = useLocalRuntime(jedidiahChatAdapter, {
    adapters: {
      history,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantChatFrame />
    </AssistantRuntimeProvider>
  );
}

function AssistantChatFrame() {
  const { activeChatId, chatRecords, newChat, selectChat } = useAssistantChatStore(
    useShallow((state) => ({
      activeChatId: state.activeChatId,
      chatRecords: state.chats,
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
            className="w-full justify-start"
            disabled={isRunning}
            onClick={() => newChat()}
            type="button"
            variant="outline"
          >
            <PlusIcon />
            New Chat
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1">
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;

              return (
                <button
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
                    isActive && 'bg-muted font-medium',
                  )}
                  disabled={isRunning}
                  key={chat.id}
                  onClick={() => selectChat(chat.id)}
                  type="button"
                >
                  <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{chat.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <Thread />
    </div>
  );
}
