import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { type FC, useState } from 'react';

import { createAssistantChatTransport } from './assistant-chat-transport.js';
import { AssistantDevtools } from './assistant-devtools.js';
import { AssistantModal } from './assistant-modal.js';

export const SidebarAssistantRuntime: FC = () => {
  // The transport closes over the api origin + credentialed fetch; build it once so it stays stable
  // across renders rather than reconnecting on every render.
  const [transport] = useState(() => createAssistantChatTransport());
  const runtime = useChatRuntime({ transport });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModal />
      <AssistantDevtools />
    </AssistantRuntimeProvider>
  );
};
