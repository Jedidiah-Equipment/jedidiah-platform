import { Chat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { createAssistantTransport } from '@/lib/assistant-chat';

type AssistantContextValue = {
  chat: Chat<UIMessage>;
  reset: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  // This instance outlives the modal route, so dismissing it never aborts or discards the thread.
  const [chat, setChat] = useState(() => createAssistantChat());
  const reset = useCallback(() => {
    void chat.stop();
    setChat(createAssistantChat());
  }, [chat]);
  const value = useMemo(() => ({ chat, reset }), [chat, reset]);

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

function createAssistantChat(): Chat<UIMessage> {
  return new Chat<UIMessage>({ transport: createAssistantTransport() });
}

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error('useAssistant must be used within AssistantProvider');
  }
  return context;
}
