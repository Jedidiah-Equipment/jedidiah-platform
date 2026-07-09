import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { type FC, useState } from 'react';

import { authClient } from '@/lib/auth-client.js';

import { createAssistantChatTransport } from './assistant-chat-transport.js';
import { AssistantDevtools } from './assistant-devtools.js';
import { AssistantModal } from './assistant-modal.js';

// Floating assistant widget mounted in the authed shell. Only assistant-enabled users get it; the
// API is the real authorization boundary, so this gate is UX (mirrors the Assistant nav link). History
// is ephemeral — the runtime holds it in memory and a refresh starts a fresh conversation.
export const FloatingAssistant: FC = () => {
  const { data: session } = authClient.useSession();

  if (session?.user.assistantEnabled !== true) {
    return null;
  }

  return <FloatingAssistantRuntime />;
};

const FloatingAssistantRuntime: FC = () => {
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
