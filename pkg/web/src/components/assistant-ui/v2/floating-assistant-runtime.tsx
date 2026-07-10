import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { type FC, useState } from 'react';

import { authClient } from '@/lib/auth-client.js';

import { createAssistantChatTransport } from './assistant-chat-transport.js';
import { AssistantDevtools } from './assistant-devtools.js';
import { AssistantModal } from './assistant-modal.js';

// Development-only floating assistant runtime. The wrapper owns the compile-time environment gate;
// this module owns session eligibility and the actual assistant-ui runtime.
export const FloatingAssistantRuntime: FC = () => {
  const { data: session } = authClient.useSession();

  if (session?.user.assistantEnabled !== true) {
    return null;
  }

  return <EnabledFloatingAssistant />;
};

const EnabledFloatingAssistant: FC = () => {
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
