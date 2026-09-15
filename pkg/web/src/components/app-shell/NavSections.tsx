import { hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { IconAlertTriangle, IconChevronRight, type TablerIcon } from '@tabler/icons-react';
import { Link, useLocation } from '@tanstack/react-router';
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
  useSidebar,
} from '@/components/ui/sidebar.js';
import { useAccess } from '@/hooks/use-access.js';
import { cn } from '@/lib/utils.js';

type NavLinkProps = React.ComponentProps<typeof Link>;

export type NavSubItem = {
  title: string;
  permission?: AppPermission;
  link: NavLinkProps;
  /** Overrides the exact-match active state for a child whose area spans several routes. */
  isActive?: (pathname: string) => boolean;
  indicator?: React.ComponentType;
};

export type MainNavItem = {
  title: string;
  permission?: AppPermission;
  link: NavLinkProps;
  icon: TablerIcon;
  isActive?: (pathname: string) => boolean;
  indicator?: React.ComponentType;
  children?: readonly NavSubItem[];
};

export type NavSection = {
  label?: string;
  items: readonly MainNavItem[];
};

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
  item: MainNavItem;
  navLink: NavLinkProps;
  subItems: readonly NavSubItem[];
  pathname: string;
  onNavigate: (() => void) | undefined;
}> = ({ item, navLink, subItems, pathname, onNavigate }) => {
  const [open, setOpen] = React.useState(true);
  const sidebar = useSidebar();
  const showCollapsedIndicator = !sidebar.isMobile && sidebar.state === 'collapsed';
  const showSubIndicators = sidebar.isMobile || sidebar.state === 'expanded';
  const { icon: Icon, indicator: Indicator } = item;

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
      <Link {...navLink} onClick={() => setOpen((value) => !value)}>
        {({ isActive: linkIsActive }) => {
          const isActive = item.isActive ? item.isActive(pathname) : linkIsActive;

          return (
            <SidebarMenuButton
              isActive={isActive}
              render={<span />}
              tooltip={item.title}
              className={cn(biggerIconClass, !isActive && inactiveItemClass)}
            >
              <Icon />
              <span>{item.title}</span>
              <IconChevronRight
                aria-hidden="true"
                className={cn('ml-auto size-4! transition-transform', open && 'rotate-90')}
              />
              {showCollapsedIndicator && Indicator ? <Indicator /> : null}
            </SidebarMenuButton>
          );
        }}
      </Link>
      <CollapsibleContent>
        <SidebarMenuSub>
          {subItems.map((child) => {
            const ChildIndicator = child.indicator;

            return (
              <SidebarMenuSubItem className="[&_[data-sidebar=menu-badge]]:top-1" key={child.title}>
                {/* Exact match so a parent route (e.g. /jobs) isn't flagged active on a child route (/jobs/calendar). */}
                <Link {...child.link} activeOptions={{ exact: true }} onClick={onNavigate}>
                  {({ isActive: linkIsActive }) => {
                    const isActive = child.isActive ? child.isActive(pathname) : linkIsActive;

                    return (
                      <SidebarMenuSubButton
                        isActive={isActive}
                        render={<span />}
                        className={cn(activeSubMarkerClass, !isActive && inactiveItemClass)}
                      >
                        <span>{child.title}</span>
                        {showSubIndicators && ChildIndicator ? <ChildIndicator /> : null}
                      </SidebarMenuSubButton>
                    );
                  }}
                </Link>
              </SidebarMenuSubItem>
            );
          })}
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

type NavSectionsProps = {
  sections: readonly NavSection[];
  /** Close the mobile sidebar sheet when a destination link is followed. */
  closeMobileOnNavigate?: boolean;
};

export const NavSections: React.FC<NavSectionsProps> = ({ sections, closeMobileOnNavigate = false }) => {
  const accessQuery = useAccess();
  const { setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });

  const canSee = (permission?: AppPermission) =>
    permission === undefined || hasPermission(accessQuery.data, permission);
  const visibleSections = getVisibleNavSections(sections, canSee);
  const accessState = navAccessState(accessQuery);
  const onNavigate = closeMobileOnNavigate ? () => setOpenMobile(false) : undefined;

  return (
    <>
      {visibleSections.map((section, index) => (
        <SidebarGroup key={section.label || `section-${index}`}>
          {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
          <SidebarMenu className="gap-1">
            {section.items.map((item) => {
              const subItems = item.children ?? [];
              const [firstChild] = subItems;
              const Indicator = item.indicator;

              if (!firstChild) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <Link {...item.link} onClick={onNavigate}>
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
                  item={item}
                  navLink={firstChild.link}
                  subItems={subItems}
                  pathname={pathname}
                  onNavigate={onNavigate}
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
 * What the nav can honestly say about permissions it has not got. Most items are gated, so an
 * unresolved access check used to render as a permission-less account: a sidebar holding nothing but
 * the ungated items, with no hint anything had gone wrong and nothing to retry. React Query keeps the
 * last good permissions through a later failure, so `unavailable` only ever stands for a first check
 * that never landed — a genuinely permission-less account still reads as `ready`.
 */
export function navAccessState(access: { isLoadingError: boolean; isPending: boolean }): NavAccessState {
  if (access.isLoadingError) return 'unavailable';

  return access.isPending ? 'checking' : 'ready';
}

export type NavAccessState = 'checking' | 'ready' | 'unavailable';

export function getVisibleNavSections(
  sections: readonly NavSection[],
  canSee: (permission?: AppPermission) => boolean,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item): MainNavItem[] => {
        if (!canSee(item.permission)) {
          return [];
        }

        if (!item.children) {
          return [item];
        }

        const children = item.children.filter((child) => canSee(child.permission));

        return children.length > 0 ? [{ ...item, children }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}
