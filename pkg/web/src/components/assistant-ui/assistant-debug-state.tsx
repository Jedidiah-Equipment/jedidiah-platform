import { createContext, useContext } from 'react';

type AssistantDebugState = {
  debugEnabled: boolean;
  setDebugEnabled: (enabled: boolean) => void;
  toggleDebugEnabled: () => void;
};

const AssistantDebugContext = createContext<AssistantDebugState | null>(null);

export const AssistantDebugProvider = AssistantDebugContext.Provider;

export function useAssistantDebugEnabled(): boolean {
  return useContext(AssistantDebugContext)?.debugEnabled ?? false;
}

export function useAssistantDebugState(): AssistantDebugState {
  const state = useContext(AssistantDebugContext);

  if (!state) {
    throw new Error('AssistantDebugProvider is missing');
  }

  return state;
}
