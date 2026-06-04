import { AssistantRuntimeProvider, useAui, useAuiState, useLocalRuntime } from '@assistant-ui/react';
import { IconMessage, IconPlus, IconTrash } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { withAssistantDraftPromptHistoryState } from './assistant-history-state.js';
import { jedidiahChatAdapter } from './assistant-ui-adapter.js';

type AssistantPanelProps = {
  newChat?: boolean;
  prompt?: string | undefined;
};

type PendingDraftPrompt = {
  chatId: string;
  prompt: string;
};

export function AssistantPanel({ newChat = false, prompt }: AssistantPanelProps) {
  const navigate = useNavigate();
  const { activeChatId, activeChat } = useAssistantChatStore(
    useShallow((state) => ({
      activeChat: state.chats[state.activeChatId],
      activeChatId: state.activeChatId,
    })),
  );
  const handledDraftSearchRef = useRef<string | null>(null);
  const [pendingDraftPrompt, setPendingDraftPrompt] = useState<PendingDraftPrompt | null>(null);

  useEffect(() => {
    if (!activeChat) {
      useAssistantChatStore.getState().createChat();
    }
  }, [activeChat]);

  useEffect(() => {
    const draftSearchKey = prompt ? `${newChat ? 'new' : 'active'}:${prompt}` : null;

    if (!draftSearchKey || !prompt) {
      handledDraftSearchRef.current = null;
      return;
    }

    if (handledDraftSearchRef.current === draftSearchKey) {
      return;
    }

    handledDraftSearchRef.current = draftSearchKey;

    const store = useAssistantChatStore.getState();
    const targetChatId = newChat ? store.createChat() : store.activeChatId;

    setPendingDraftPrompt({ chatId: targetChatId, prompt });
  }, [newChat, prompt]);

  const handleDraftPromptConsumed = useCallback(() => {
    setPendingDraftPrompt(null);
    void navigate({
      replace: true,
      search: (current) => ({
        ...current,
        newChat: undefined,
        prompt: undefined,
      }),
      state: (current) => withAssistantDraftPromptHistoryState(current, undefined),
      to: '/assistant',
    });
  }, [navigate]);

  if (!activeChat) {
    return null;
  }

  const activeDraftPrompt = pendingDraftPrompt?.chatId === activeChatId ? pendingDraftPrompt.prompt : undefined;

  return (
    <AssistantRuntimeSession
      key={activeChatId}
      activeChatId={activeChatId}
      composerSlot={
        activeDraftPrompt ? (
          <AssistantDraftPrompt prompt={activeDraftPrompt} onConsumed={handleDraftPromptConsumed} />
        ) : null
      }
    />
  );
}

function AssistantRuntimeSession({ activeChatId, composerSlot }: { activeChatId: string; composerSlot?: ReactNode }) {
  const aui = useAui({});
  const history = useMemo(() => createAssistantChatHistoryAdapter(activeChatId), [activeChatId]);
  const runtime = useLocalRuntime(jedidiahChatAdapter, {
    adapters: {
      history,
    },
  });

  return (
    <AssistantRuntimeProvider aui={aui} runtime={runtime}>
      <AssistantChatFrame composerSlot={composerSlot} />
    </AssistantRuntimeProvider>
  );
}

function AssistantChatFrame({ composerSlot }: { composerSlot?: ReactNode }) {
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
      <Thread composerSlot={composerSlot} />
    </div>
  );
}

function AssistantDraftPrompt({ onConsumed, prompt }: { onConsumed: () => void; prompt: string }) {
  const aui = useAui();

  useEffect(() => {
    aui.composer().setText(prompt);
    onConsumed();
  }, [aui, onConsumed, prompt]);

  return null;
}
