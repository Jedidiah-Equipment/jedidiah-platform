import { LifeBuoyIcon, type LucideIcon, SendIcon } from 'lucide-react';
import type React from 'react';

import { SidebarLink } from '@/components/app-shell/SidebarLink.js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.js';

type SecondaryNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

const secondaryNavItems: SecondaryNavItem[] = [
  {
    title: 'Support',
    url: '#',
    icon: LifeBuoyIcon,
  },
  {
    title: 'Feedback',
    url: '#',
    icon: SendIcon,
  },
];

export const AppNavSecondary: React.FC<React.ComponentPropsWithoutRef<typeof SidebarGroup>> = (props) => {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {secondaryNavItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={
                  <SidebarLink href={item.url} label={item.title}>
                    {item.title}
                  </SidebarLink>
                }
                size="sm"
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
