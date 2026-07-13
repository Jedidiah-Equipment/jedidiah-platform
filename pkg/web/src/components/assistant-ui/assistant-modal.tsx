import { AssistantModalPrimitive } from '@assistant-ui/react';
import { IconChevronDown, IconMessageChatbot } from '@tabler/icons-react';
import type { FC } from 'react';

import { cn } from '@/lib/utils.js';

import { ModalThread } from './thread.js';

export const AssistantModal: FC = () => {
  return (
    <AssistantModalPrimitive.Root>
      {/* In dev the assistant-ui devtools mounts its own fixed button in the bottom-right corner; lift
          the FAB above it so the two don't overlap. Production ships without devtools, so the FAB
          sits flush in the corner. */}
      <AssistantModalPrimitive.Anchor
        className={cn('fixed right-4 z-50 size-12', import.meta.env.DEV ? 'bottom-20' : 'bottom-4')}
      >
        <AssistantModalPrimitive.Trigger
          aria-label="Toggle assistant"
          className={cn(
            'group flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50',
          )}
        >
          <IconMessageChatbot className="size-6 group-data-[state=open]:hidden" />
          <IconChevronDown className="size-6 group-data-[state=closed]:hidden" />
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>
      <AssistantModalPrimitive.Content
        align="end"
        className="z-50 flex h-[32rem] max-h-[calc(100svh-6rem)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        side="top"
        sideOffset={12}
      >
        <ModalThread />
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
};
