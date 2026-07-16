import { AssistantModalPrimitive } from '@assistant-ui/react';
import type { FC } from 'react';

import { useSidebar } from '@/components/ui/sidebar.js';

import { AssistantSidebarTrigger } from './assistant-sidebar-trigger.js';
import { ModalThread } from './thread.js';

export const AssistantModal: FC = () => {
  const { isMobile } = useSidebar();

  return (
    <AssistantModalPrimitive.Root>
      <AssistantSidebarTrigger />
      <AssistantModalPrimitive.Content
        align="end"
        className="z-50 flex h-[32rem] max-h-[calc(100svh-6rem)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        side={isMobile ? 'top' : 'right'}
        sideOffset={12}
      >
        <ModalThread />
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
};
