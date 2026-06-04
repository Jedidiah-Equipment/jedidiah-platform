import type React from 'react';

import { AssistantPanel } from './AssistantPanel.js';

type AssistantPageProps = {
  newChat?: boolean;
  prompt?: string | undefined;
};

export const AssistantPage: React.FC<AssistantPageProps> = ({ newChat = false, prompt }) => {
  return (
    <div className="box-border flex h-[calc(100svh-4rem)] min-h-0 min-w-0 flex-col overflow-hidden p-4 pt-0 md:h-[calc(100svh-5rem)]">
      <AssistantPanel newChat={newChat} prompt={prompt} />
    </div>
  );
};
