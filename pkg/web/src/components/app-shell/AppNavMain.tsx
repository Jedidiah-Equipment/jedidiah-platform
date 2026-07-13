import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import {
  IconBriefcase2,
  IconBuilding,
  IconCategory2,
  IconChevronRight,
  IconClipboardList,
  IconFileText,
  IconGauge,
  IconHeartHandshake,
  IconLayoutKanban,
  IconMessageReport,
  IconPackage,
  IconRobot,
  IconTool,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, linkOptions } from '@tanstack/react-router';
import React from 'react';

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';
import { authClient } from '@/lib/auth-client.js';
import { cn } from '@/lib/utils.js';
import { FeedbackOpenNavIndicator, QuotesPriorityNavIndicator } from './AppNavIndicators.js';

type NavSubItem = {
  title: string;
  permission?: AppPermission;
  link: ReturnType<typeof linkOptions>;
};

type MainNavItem = {
  title: string;
  permission?: AppPermission;
  requiresAssistantEnabled?: boolean;
  link: ReturnType<typeof linkOptions>;
  icon: TablerIcon;
  indicator?: React.ComponentType;
  children?: readonly NavSubItem[];
};

type NavSection = {
  label?: string;
  items: readonly MainNavItem[];
};

const navSections = [
  {
    label: '',
    items: [
      {
        title: 'Dashboard',
        link: linkOptions({ to: '/dashboard' }),
        icon: IconGauge,
      },
      {
        title: 'Assistant',
        requiresAssistantEnabled: true,
        link: linkOptions({ to: '/assistant' }),
        icon: IconRobot,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'Quotes',
        permission: 'quote:read',
        link: linkOptions({ to: '/quotes' }),
        icon: IconFileText,
        indicator: QuotesPriorityNavIndicator,
      },
      {
        title: 'Jobs',
        permission: 'job:read',
        link: linkOptions({ to: '/jobs' }),
        icon: IconBriefcase2,
        children: [
          {
            title: 'List',
            permission: 'job:read',
            link: linkOptions({ to: '/jobs/list' }),
          },
          {
            title: 'Planning',
            permission: 'job:read',
            link: linkOptions({ to: '/jobs' }),
          },
          {
            title: 'Calendar',
            permission: 'job:read',
            link: linkOptions({ to: '/jobs/calendar' }),
          },
        ],
      },
      {
        title: 'Customers',
        permission: 'customer:read',
        link: linkOptions({ to: '/customers' }),
        icon: IconBuilding,
      },
      {
        title: 'Suppliers',
        permission: 'supplier:read',
        link: linkOptions({ to: '/suppliers' }),
        icon: IconHeartHandshake,
      },
      {
        title: 'Parts',
        permission: 'part:read',
        link: linkOptions({ to: '/parts' }),
        icon: IconTool,
      },
      {
        title: 'Products',
        permission: 'product:read',
        link: linkOptions({ to: '/products' }),
        icon: IconPackage,
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        title: 'Bays',
        permission: 'job_bay:read',
        link: linkOptions({ to: '/bays' }),
        icon: IconLayoutKanban,
      },
      {
        title: 'Users',
        permission: 'user:list',
        link: linkOptions({ to: '/users' }),
        icon: IconUsers,
      },
      {
        title: 'Product Ranges',
        permission: 'product_range:read',
        link: linkOptions({ to: '/product-ranges' }),
        icon: IconCategory2,
      },
      {
        title: 'Feedback',
        permission: 'feedback:read',
        link: linkOptions({ to: '/feedback' }),
        icon: IconMessageReport,
        indicator: FeedbackOpenNavIndicator,
      },
      {
        title: 'Audit',
        permission: 'audit:read',
        link: linkOptions({ to: '/audit' }),
        icon: IconClipboardList,
      },
    ],
  },
] as const satisfies readonly NavSection[];

// Inactive items render dimmed; the active item stays at full contrast (the
// active state also gets a background + accent foreground from the button variant).
const inactiveItemClass = 'text-sidebar-foreground/55';
// Bump the icon up from the variant default (size-4) for a bit more presence.
const biggerIconClass = '[&_svg]:size-5';
// The active child gets a bright vertical marker that overlays the sub-menu's
// guide line on its left edge (the button's own overflow is opened up so the
// marker isn't clipped).
const activeSubMarkerClass =
  'relative overflow-visible data-active:before:absolute data-active:before:-left-2.5 data-active:before:inset-y-0.5 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-sidebar-foreground';

type NavLinkProps = React.ComponentProps<typeof Link>;

// A parent that expands to its children. The parent row doubles as a shortcut
// to its first child (same destination) and toggles the group open/closed.
const NavCollapsibleItem: React.FC<{
  title: string;
  icon: TablerIcon;
  indicator?: React.ComponentType | undefined;
  navLink: NavLinkProps;
  subItems: ReadonlyArray<{ title: string; link: NavLinkProps }>;
}> = ({ title, icon: Icon, indicator: Indicator, navLink, subItems }) => {
  const [open, setOpen] = React.useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
      <Link {...navLink} onClick={() => setOpen((value) => !value)}>
        {({ isActive }) => (
          <SidebarMenuButton
            isActive={isActive}
            render={<span />}
            tooltip={title}
            className={cn(biggerIconClass, !isActive && inactiveItemClass)}
          >
            <Icon />
            <span>{title}</span>
            {Indicator ? <Indicator /> : null}
            <IconChevronRight
              aria-hidden="true"
              className={cn('ml-auto size-4! transition-transform', open && 'rotate-90')}
            />
          </SidebarMenuButton>
        )}
      </Link>
      <CollapsibleContent>
        <SidebarMenuSub>
          {subItems.map((child) => (
            <SidebarMenuSubItem key={child.title}>
              {/* Exact match so a parent route (e.g. /jobs) isn't flagged active on a child route (/jobs/calendar). */}
              <Link {...child.link} activeOptions={{ exact: true }}>
                {({ isActive }) => (
                  <SidebarMenuSubButton
                    isActive={isActive}
                    render={<span />}
                    className={cn(activeSubMarkerClass, !isActive && inactiveItemClass)}
                  >
                    <span>{child.title}</span>
                  </SidebarMenuSubButton>
                )}
              </Link>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const AppNavMain: React.FC = () => {
  const accessQuery = useAccess();
  const { data: session } = authClient.useSession();
  const assistantEnabled = session?.user.assistantEnabled === true;

  const canSee = (permission?: AppPermission) =>
    permission === undefined || hasPermission(accessQuery.data, permission);

  const canSeeItem = (item: MainNavItem) =>
    canSee('permission' in item ? item.permission : undefined) &&
    (!('requiresAssistantEnabled' in item && item.requiresAssistantEnabled) || assistantEnabled);

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSeeItem(item)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {visibleSections.map((section, index) => (
        <SidebarGroup key={section.label ?? `section-${index}`}>
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarMenu className="gap-1">
            {section.items.map((item) => {
              const subItems = 'children' in item ? item.children.filter((child) => canSee(child.permission)) : [];
              const [firstChild] = subItems;
              const Indicator = 'indicator' in item ? item.indicator : undefined;

              if (!firstChild) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <Link {...item.link}>
                      {({ isActive }) => (
                        <SidebarMenuButton
                          isActive={isActive}
                          render={<span />}
                          tooltip={item.title}
                          className={cn(biggerIconClass, !isActive && inactiveItemClass)}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                          {Indicator ? <Indicator /> : null}
                        </SidebarMenuButton>
                      )}
                    </Link>
                  </SidebarMenuItem>
                );
              }

              return (
                <NavCollapsibleItem
                  key={item.title}
                  title={item.title}
                  icon={item.icon}
                  indicator={Indicator}
                  navLink={firstChild.link}
                  subItems={subItems}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
};
