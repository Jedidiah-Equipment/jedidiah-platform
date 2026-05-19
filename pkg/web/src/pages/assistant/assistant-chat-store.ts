import type {
  ExportedMessageRepository,
  ExportedMessageRepositoryItem,
  ThreadHistoryAdapter,
  ThreadMessage,
} from '@assistant-ui/react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

type SerializedThreadMessage = Omit<ThreadMessage, 'createdAt'> & {
  createdAt: string;
};

type SerializedMessageRepositoryItem = Omit<ExportedMessageRepositoryItem, 'message'> & {
  message: SerializedThreadMessage;
};

export type AssistantChatRepository = {
  headId: string | null;
  messages: SerializedMessageRepositoryItem[];
};

export type AssistantChat = {
  createdAt: string;
  id: string;
  repository: AssistantChatRepository;
  title: string;
  updatedAt: string;
};

export type AssistantChatStore = {
  activeChatId: string;
  chats: Record<string, AssistantChat>;
  appendRepositoryItem: (chatId: string, item: ExportedMessageRepositoryItem) => void;
  createChat: () => string;
  deleteChat: (chatId: string) => void;
  newChat: () => string;
  selectChat: (chatId: string) => void;
};

const ASSISTANT_CHAT_PERSIST_NAME = 'assistant-chats';
const DEFAULT_CHAT_TITLE = 'New chat';

const testStorage: StateStorage = {
  getItem: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const initialChat = createAssistantChat();

export const useAssistantChatStore = create<AssistantChatStore>()(
  persist(
    (set, get) => ({
      activeChatId: initialChat.id,
      chats: {
        [initialChat.id]: initialChat,
      },
      appendRepositoryItem: (chatId, item) =>
        set((state) => ({
          chats: {
            ...state.chats,
            [chatId]: appendAssistantChatRepositoryItem(state.chats[chatId] ?? createAssistantChat(chatId), item),
          },
        })),
      createChat: () => {
        const chat = createAssistantChat();

        set((state) => ({
          activeChatId: chat.id,
          chats: {
            ...state.chats,
            [chat.id]: chat,
          },
        }));

        return chat.id;
      },
      deleteChat: (chatId) =>
        set((state) => {
          if (!state.chats[chatId]) {
            return state;
          }

          const remainingChats = Object.fromEntries(
            Object.entries(state.chats).filter(([candidateChatId]) => candidateChatId !== chatId),
          );

          if (state.activeChatId !== chatId) {
            return {
              chats: remainingChats,
            };
          }

          const nextActiveChat = getSortedAssistantChats(remainingChats)[0] ?? createAssistantChat();

          return {
            activeChatId: nextActiveChat.id,
            chats: {
              ...remainingChats,
              [nextActiveChat.id]: nextActiveChat,
            },
          };
        }),
      newChat: () => {
        const state = get();
        const activeChat = state.chats[state.activeChatId];

        if (activeChat && activeChat.repository.messages.length === 0) {
          return activeChat.id;
        }

        return state.createChat();
      },
      selectChat: (chatId) =>
        set((state) => {
          if (!state.chats[chatId]) {
            return state;
          }

          return {
            activeChatId: chatId,
          };
        }),
    }),
    {
      name: ASSISTANT_CHAT_PERSIST_NAME,
      storage: createJSONStorage(getAssistantChatStorage),
      partialize: (state) => ({
        activeChatId: state.activeChatId,
        chats: state.chats,
      }),
      version: 1,
    },
  ),
);

export function createAssistantChatHistoryAdapter(chatId: string): ThreadHistoryAdapter {
  return {
    async load() {
      const chat = useAssistantChatStore.getState().chats[chatId];

      return deserializeRepository(chat?.repository ?? createEmptyRepository());
    },
    async append(item) {
      useAssistantChatStore.getState().appendRepositoryItem(chatId, item);
    },
  };
}

export function getSortedAssistantChats(chats: Record<string, AssistantChat>): AssistantChat[] {
  return Object.values(chats).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createAssistantChat(id = createAssistantChatId(), now = new Date()): AssistantChat {
  const timestamp = now.toISOString();

  return {
    createdAt: timestamp,
    id,
    repository: createEmptyRepository(),
    title: DEFAULT_CHAT_TITLE,
    updatedAt: timestamp,
  };
}

export function appendAssistantChatRepositoryItem(
  chat: AssistantChat,
  item: ExportedMessageRepositoryItem,
  now = new Date(),
): AssistantChat {
  const repository = upsertRepositoryItem(chat.repository, serializeRepositoryItem(item));

  return {
    ...chat,
    repository,
    title: deriveAssistantChatTitle(repository),
    updatedAt: now.toISOString(),
  };
}

export function deriveAssistantChatTitle(repository: AssistantChatRepository): string {
  const titleParts: string[] = [];

  for (const item of repository.messages) {
    if (item.message.role !== 'user') {
      continue;
    }

    for (const part of item.message.content) {
      if (part.type === 'text') {
        titleParts.push(part.text);
      }
    }
  }

  const text = titleParts.join(' ').replace(/\s+/g, ' ').trim();

  if (!text) {
    return DEFAULT_CHAT_TITLE;
  }

  return text.length > 48 ? `${text.slice(0, 45).trimEnd()}...` : text;
}

function createEmptyRepository(): AssistantChatRepository {
  return {
    headId: null,
    messages: [],
  };
}

function upsertRepositoryItem(
  repository: AssistantChatRepository,
  item: SerializedMessageRepositoryItem,
): AssistantChatRepository {
  const messages = repository.messages.filter((entry) => entry.message.id !== item.message.id);

  return {
    headId: item.message.id,
    messages: [...messages, item],
  };
}

function serializeRepositoryItem(item: ExportedMessageRepositoryItem): SerializedMessageRepositoryItem {
  return {
    ...item,
    message: {
      ...item.message,
      createdAt: item.message.createdAt.toISOString(),
    },
  };
}

function deserializeRepository(repository: AssistantChatRepository): ExportedMessageRepository {
  return {
    headId: repository.headId,
    messages: repository.messages.map((item) => ({
      ...item,
      message: {
        ...item.message,
        createdAt: new Date(item.message.createdAt),
      } as ThreadMessage,
    })),
  };
}

function createAssistantChatId(): string {
  return `chat-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function getAssistantChatStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? testStorage : localStorage;
}
