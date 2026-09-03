import { AssistantModalPrimitive } from '@assistant-ui/react';
import { IconMessageChatbot } from '@tabler/icons-react';
import type { FC } from 'react';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar.js';

export const AssistantSidebarTrigger: FC = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <AssistantModalPrimitive.Anchor>
        <AssistantModalPrimitive.Trigger asChild>
          <SidebarMenuButton tooltip="AI Assistant">
            <IconMessageChatbot className="text-primary" />
            <span>AI Assistant</span>
          </SidebarMenuButton>
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>
    </SidebarMenuItem>
  </SidebarMenu>
);
