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

  it('deletes an inactive chat without changing the active chat', () => {
    const firstChat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const secondChat = createAssistantChat('chat-2', new Date('2026-05-18T12:01:00.000Z'));

    useAssistantChatStore.setState({
      activeChatId: firstChat.id,
      chats: {
        [firstChat.id]: firstChat,
        [secondChat.id]: secondChat,
      },
    });

    useAssistantChatStore.getState().deleteChat(secondChat.id);

    expect(useAssistantChatStore.getState().activeChatId).toBe(firstChat.id);
    expect(useAssistantChatStore.getState().chats).toEqual({
      [firstChat.id]: firstChat,
    });
  });

  it('deletes the active chat and selects the most recently updated remaining chat', () => {
    const activeChat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const olderChat = createAssistantChat('chat-2', new Date('2026-05-18T12:01:00.000Z'));
    const newerChat = createAssistantChat('chat-3', new Date('2026-05-18T12:02:00.000Z'));

    useAssistantChatStore.setState({
      activeChatId: activeChat.id,
      chats: {
        [activeChat.id]: activeChat,
        [olderChat.id]: olderChat,
        [newerChat.id]: newerChat,
      },
    });

    useAssistantChatStore.getState().deleteChat(activeChat.id);

    expect(useAssistantChatStore.getState().activeChatId).toBe(newerChat.id);
    expect(Object.keys(useAssistantChatStore.getState().chats).sort()).toEqual([olderChat.id, newerChat.id]);
  });

  it('deletes the only chat and creates a replacement active chat', () => {
    const activeChat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));

    useAssistantChatStore.setState({
      activeChatId: activeChat.id,
      chats: {
        [activeChat.id]: activeChat,
      },
    });

    useAssistantChatStore.getState().deleteChat(activeChat.id);

    const state = useAssistantChatStore.getState();

    expect(state.activeChatId).not.toBe(activeChat.id);
    expect(state.chats[state.activeChatId]?.repository.messages).toEqual([]);
    expect(Object.keys(state.chats)).toEqual([state.activeChatId]);
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

  it('keeps the title based on the first user turn after later prompts', () => {
    const chat = createAssistantChat('chat-1', new Date('2026-05-18T12:00:00.000Z'));
    const withFirstTurn = appendAssistantChatRepositoryItem(
      chat,
      repositoryItem(userMessage('message-1', 'Show me active jobs'), null),
      new Date('2026-05-18T12:01:00.000Z'),
    );
    const withAssistant = appendAssistantChatRepositoryItem(
      withFirstTurn,
      repositoryItem(assistantMessage('message-2', 'Here are the active jobs.'), 'message-1'),
      new Date('2026-05-18T12:02:00.000Z'),
    );
    const withFollowUp = appendAssistantChatRepositoryItem(
      withAssistant,
      repositoryItem(userMessage('message-3', 'Now filter that to welding'), 'message-2'),
      new Date('2026-05-18T12:03:00.000Z'),
    );

    expect(withFollowUp.title).toBe('Show me active jobs');
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
