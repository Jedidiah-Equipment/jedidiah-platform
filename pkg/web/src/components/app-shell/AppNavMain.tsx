import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import {
  IconAlertTriangle,
  IconBriefcase2,
  IconBuilding,
  IconBuildingWarehouse,
  IconCategory2,
  IconChevronRight,
  IconClipboardCheck,
  IconClipboardList,
  IconFileText,
  IconFlagCheck,
  IconGauge,
  IconHeartHandshake,
  IconLanguage,
  IconLayoutKanban,
  IconMessageReport,
  IconPackages,
  IconReceipt2,
  IconShoppingCart,
  IconShoppingCartPlus,
  IconTool,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, linkOptions, useLocation } from '@tanstack/react-router';
import React from 'react';

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible.js';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';
import { cn } from '@/lib/utils.js';
import {
  BuyListSignalNavIndicator,
  FeedbackOpenNavIndicator,
  QuotesPriorityNavIndicator,
  ReturnsAwaitingCreditNavIndicator,
  StocktakeOverdueNavIndicator,
} from './AppNavIndicators.js';

type NavLinkProps = React.ComponentProps<typeof Link>;

type NavSubItem = {
  title: string;
  permission?: AppPermission;
  link: NavLinkProps;
};

type MainNavItem = {
  title: string;
  permission?: AppPermission;
  link: NavLinkProps;
  icon: TablerIcon;
  isActive?: (pathname: string) => boolean;
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
          {
            title: 'Activity',
            permission: 'job:read',
            link: linkOptions({ to: '/jobs/activity' }),
          },
        ],
      },
      {
        title: 'Units',
        permission: 'product_unit:read',
        link: linkOptions({ to: '/units' }),
        icon: IconBuildingWarehouse,
      },
      {
        title: 'Customers',
        permission: 'customer:read',
        link: linkOptions({ to: '/customers' }),
        icon: IconBuilding,
      },
      {
        title: 'Products',
        permission: 'product:read',
        link: linkOptions({ to: '/products' }),
        icon: IconPackages,
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
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
        title: 'Inventory',
        permission: 'inventory:read',
        link: linkOptions({ activeOptions: { exact: true }, to: '/inventory' }),
        icon: IconBuildingWarehouse,
        isActive: isInventoryNavPath,
      },
      {
        title: 'Buy list',
        permission: 'inventory:read',
        link: linkOptions({ to: '/inventory/buy-list' }),
        icon: IconShoppingCartPlus,
        indicator: BuyListSignalNavIndicator,
      },
      {
        title: 'Purchase Orders',
        permission: 'purchase_order:read',
        link: linkOptions({ to: '/purchase-orders' }),
        icon: IconShoppingCart,
        indicator: ReturnsAwaitingCreditNavIndicator,
      },
      {
        title: 'PO vs invoiced',
        permission: 'inventory_cost:read',
        link: linkOptions({ to: '/inventory/price-variance' }),
        icon: IconReceipt2,
      },
      {
        title: 'Stocktake',
        permission: 'inventory:read',
        link: linkOptions({ to: '/inventory/stocktake' }),
        icon: IconClipboardCheck,
        indicator: StocktakeOverdueNavIndicator,
      },
      {
        title: 'Close-out',
        permission: 'inventory:close-out',
        link: linkOptions({ to: '/inventory/close-out' }),
        icon: IconFlagCheck,
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
        title: 'Translations',
        permission: 'product_range:update',
        link: linkOptions({ to: '/catalog-translations' }),
        icon: IconLanguage,
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

/** Placeholder rows while the first access check is in flight, so an unresolved nav never reads as an empty one. */
const NavAccessSkeleton: React.FC = () => (
  <SidebarGroup aria-busy="true" aria-label="Checking access">
    <SidebarMenu className="gap-1">
      {SKELETON_ROWS.map((row) => (
        <SidebarMenuItem key={row}>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  </SidebarGroup>
);

const SKELETON_ROWS = ['one', 'two', 'three', 'four', 'five', 'six'];

/** Stands in for the permissions the first access check never delivered; see {@link navAccessState}. */
const NavAccessError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <SidebarGroup>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          className={cn(biggerIconClass, 'text-sidebar-foreground/70')}
          onClick={onRetry}
          tooltip="Couldn’t load your access. Retry."
        >
          <IconAlertTriangle />
          <span>Access unavailable — retry</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
);

export const AppNavMain: React.FC = () => {
  const accessQuery = useAccess();
  const pathname = useLocation({ select: (location) => location.pathname });

  const canSee = (permission?: AppPermission) =>
    permission === undefined || hasPermission(accessQuery.data, permission);
  const visibleSections = getVisibleNavSections(canSee);
  const accessState = navAccessState(accessQuery);

  return (
    <>
      {visibleSections.map((section, index) => (
        <SidebarGroup key={section.label ?? `section-${index}`}>
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarMenu className="gap-1">
            {section.items.map((item) => {
              const subItems = item.children ?? [];
              const [firstChild] = subItems;
              const Indicator = 'indicator' in item ? item.indicator : undefined;

              if (!firstChild) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <Link {...item.link}>
                      {({ isActive }) => {
                        const navItemIsActive = item.isActive ? item.isActive(pathname) : isActive;

                        return (
                          <SidebarMenuButton
                            isActive={navItemIsActive}
                            render={<span />}
                            tooltip={item.title}
                            className={cn(biggerIconClass, !navItemIsActive && inactiveItemClass)}
                          >
                            <item.icon />
                            <span>{item.title}</span>
                            {Indicator ? <Indicator /> : null}
                          </SidebarMenuButton>
                        );
                      }}
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

      {accessState === 'checking' ? <NavAccessSkeleton /> : null}
      {accessState === 'unavailable' ? <NavAccessError onRetry={() => void accessQuery.refetch()} /> : null}
    </>
  );
};

/**
 * What the nav can honestly say about permissions it has not got. Every item but Dashboard is gated,
 * so an unresolved access check used to render as a permission-less account: a sidebar holding nothing
 * but Dashboard, with no hint anything had gone wrong and nothing to retry. React Query keeps the last
 * good permissions through a later failure, so `unavailable` only ever stands for a first check that
 * never landed — a genuinely permission-less account still reads as `ready`.
 */
export function navAccessState(access: { isLoadingError: boolean; isPending: boolean }): NavAccessState {
  if (access.isLoadingError) return 'unavailable';

  return access.isPending ? 'checking' : 'ready';
}

export type NavAccessState = 'checking' | 'ready' | 'unavailable';

export function getVisibleNavSections(canSee: (permission?: AppPermission) => boolean): NavSection[] {
  return navSections
    .map((section) => ({
      label: section.label,
      items: section.items.flatMap((item): MainNavItem[] => {
        const navItem: MainNavItem = item;

        if (!canSee(navItem.permission)) {
          return [];
        }

        if (!navItem.children) {
          return [navItem];
        }

        const children = navItem.children.filter((child) => canSee(child.permission));

        return children.length > 0 ? [{ ...navItem, children }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** Inventory routes that are their own nav item, so the Part-history match must not claim them. */
const inventorySiblingRoutes = [
  '/inventory/buy-list',
  '/inventory/close-out',
  '/inventory/price-variance',
  '/inventory/stocktake',
];

export function isInventoryNavPath(pathname: string): boolean {
  if (inventorySiblingRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return false;
  }

  return pathname === '/inventory' || /^\/inventory\/[^/]+\/?$/.test(pathname);
}
