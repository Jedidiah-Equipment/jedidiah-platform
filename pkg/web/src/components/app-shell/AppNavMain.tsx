import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { Link, linkOptions } from '@tanstack/react-router';
import {
  Building2Icon,
  ClipboardListIcon,
  GaugeIcon,
  HandshakeIcon,
  type LucideIcon,
  PackageIcon,
} from 'lucide-react';
import type React from 'react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';

type MainNavItem = {
  title: string;
  permission?: AppPermission;
  link: ReturnType<typeof linkOptions>;
  icon: LucideIcon;
};

const mainNavItems = [
  {
    title: 'Dashboard',
    link: linkOptions({ to: '/dashboard' }),
    icon: GaugeIcon,
  },
  // {
  //   title: 'Quotes',
  //   permission: 'quote:read',
  //   link: linkOptions({ to: '/quotes' }),
  //   icon: FileTextIcon,
  // },
  // {
  //   title: 'Jobs',
  //   permission: 'job:read',
  //   link: linkOptions({ to: '/jobs' }),
  //   icon: BriefcaseBusinessIcon,
  // },
  {
    title: 'Customers',
    permission: 'customer:read',
    link: linkOptions({ to: '/customers' }),
    icon: Building2Icon,
  },
  {
    title: 'Suppliers',
    permission: 'supplier:read',
    link: linkOptions({ to: '/suppliers' }),
    icon: HandshakeIcon,
  },
  {
    title: 'Parts',
    permission: 'part:read',
    link: linkOptions({ to: '/parts' }),
    icon: PackageIcon,
  },
  // {
  //   title: 'Assistant',
  //   link: linkOptions({ to: '/assistant' }),
  //   icon: BotIcon,
  // },
  // {
  //   title: 'Users',
  //   permission: 'user:list',
  //   link: linkOptions({ to: '/users' }),
  //   icon: UsersIcon,
  // },
  {
    title: 'Audit',
    permission: 'audit:read',
    link: linkOptions({ to: '/audit' }),
    icon: ClipboardListIcon,
  },
] as const satisfies readonly MainNavItem[];

export const AppNavMain: React.FC = () => {
  const accessQuery = useAccess();
  const visibleNavItems = mainNavItems.filter(
    (item) => !('permission' in item) || hasPermission(accessQuery.data, item.permission),
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {visibleNavItems.map((item) => (
          <SidebarMenuItem key={item.title}>
            <Link {...item.link}>
              {({ isActive }) => (
                <SidebarMenuButton isActive={isActive} render={<span />} tooltip={item.title}>
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};
