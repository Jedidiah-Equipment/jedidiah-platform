import type { ExportedMessageRepositoryItem, ThreadMessage } from '@assistant-ui/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  appendAssistantChatRepositoryItem,
  createAssistantChat,
  createAssistantChatHistoryAdapter,
  deriveAssistantChatTitle,
  getSortedAssistantChats,
  useAssistantChatStore,
} from './assistant-chat-store.js';

describe('assistant chat persistence', () => {
  afterEach(() => {
    const chat = createAssistantChat('chat-reset', new Date('2026-05-18T00:00:00.000Z'));

    useAssistantChatStore.setState({
      activeChatId: chat.id,
      chats: {
        [chat.id]: chat,
      },
    });
  });

  it('creates a new local chat', () => {
    const chat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));

    expect(chat).toEqual({
      createdAt: '2026-05-18T12:00:00.000Z',
      id: 'chat-1',
      repository: {
        headId: null,
        messages: [],
      },
      title: 'New chat',
      updatedAt: '2026-05-18T12:00:00.000Z',
    });
  });

  it('appends user and assistant messages', () => {
    const chat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const withUser = appendAssistantChatRepositoryItem(
      chat,
      repositoryItem(userMessage('message-1', 'Show me open jobs'), null),
      new Date('2026-05-18T12:01:00.000Z'),
    );
    const withAssistant = appendAssistantChatRepositoryItem(
      withUser,
      repositoryItem(assistantMessage('message-2', 'Here are the jobs.'), 'message-1'),
      new Date('2026-05-18T12:02:00.000Z'),
    );

    expect(withAssistant.repository.headId).toBe('message-2');
    expect(withAssistant.repository.messages).toHaveLength(2);
    expect(withAssistant.title).toBe('Show me open jobs');
    expect(withAssistant.updatedAt).toBe('2026-05-18T12:02:00.000Z');
  });

  it('reloads the same thread from persisted state', async () => {
    const chat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const savedChat = appendAssistantChatRepositoryItem(
      chat,
      repositoryItem(userMessage('message-1', 'What quotes are pending?'), null),
      new Date('2026-05-18T12:01:00.000Z'),
    );

    useAssistantChatStore.setState({
      activeChatId: savedChat.id,
      chats: {
        [savedChat.id]: savedChat,
      },
    });

    const repository = await createAssistantChatHistoryAdapter(savedChat.id).load();

    expect(repository.headId).toBe('message-1');
    expect(repository.messages[0]?.message.createdAt).toBeInstanceOf(Date);
    expect(getText(repository.messages[0]?.message)).toBe('What quotes are pending?');
  });

  it('switches active threads without losing the previous one', () => {
    const firstChat = appendAssistantChatRepositoryItem(
      createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z')),
      repositoryItem(userMessage('message-1', 'First'), null),
      new Date('2026-05-18T12:01:00.000Z'),
    );
    const secondChat = appendAssistantChatRepositoryItem(
      createAssistantChat('chat-2', new Date('2026-05-18T12:02:00.000Z')),
      repositoryItem(userMessage('message-2', 'Second'), null),
      new Date('2026-05-18T12:03:00.000Z'),
    );

    useAssistantChatStore.setState({
      activeChatId: firstChat.id,
      chats: {
        [firstChat.id]: firstChat,
        [secondChat.id]: secondChat,
      },
    });

    useAssistantChatStore.getState().selectChat(secondChat.id);

    expect(useAssistantChatStore.getState().activeChatId).toBe(secondChat.id);
    expect(useAssistantChatStore.getState().chats[firstChat.id]?.title).toBe('First');
  });

  it('sorts chats by most recently updated first', () => {
    const older = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const newer = createAssistantChat('chat-2', new Date('2026-05-18T12:01:00.000Z'));

    expect(getSortedAssistantChats({ [older.id]: older, [newer.id]: newer }).map((chat) => chat.id)).toEqual([
      'chat-2',
      'chat-1',
    ]);
  });

  it('derives a title from the first user text', () => {
    const chat = appendAssistantChatRepositoryItem(
      createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z')),
      repositoryItem(userMessage('message-1', '   Please summarize   customer activity   '), null),
      new Date('2026-05-18T12:01:00.000Z'),
    );

    expect(deriveAssistantChatTitle(chat.repository)).toBe('Please summarize customer activity');
  });
});

function repositoryItem(message: ThreadMessage, parentId: string | null): ExportedMessageRepositoryItem {
  return {
    message,
    parentId,
  };
}

function userMessage(id: string, text: string): ThreadMessage {
  return {
    attachments: [],
    content: [{ text, type: 'text' }],
    createdAt: new Date('2026-05-18T12:00:00.000Z'),
    id,
    metadata: {
      custom: {},
    },
    role: 'user',
  };
}

function assistantMessage(id: string, text: string): ThreadMessage {
  return {
    content: [{ text, type: 'text' }],
    createdAt: new Date('2026-05-18T12:00:00.000Z'),
    id,
    metadata: {
      custom: {},
      steps: [],
      unstable_annotations: [],
      unstable_data: [],
      unstable_state: null,
    },
    role: 'assistant',
    status: {
      reason: 'stop',
      type: 'complete',
    },
  };
}

function getText(message: ThreadMessage | undefined): string {
  return (
    message?.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('') ?? ''
  );
}
