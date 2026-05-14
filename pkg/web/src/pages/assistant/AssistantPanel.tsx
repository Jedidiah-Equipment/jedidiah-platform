import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';

import { Thread } from '@/components/assistant-ui/thread.js';

import { jedidiahChatAdapter } from './assistant-ui-adapter.js';

export function AssistantPanel() {
  const runtime = useLocalRuntime(jedidiahChatAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
