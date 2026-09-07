import { IconChevronRight, IconGauge, IconTractor } from '@tabler/icons-react';
import { Link, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
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
  useSidebar,
} from '@/components/ui/sidebar.js';
import { useCan } from '@/hooks/use-access.js';
import { cn } from '@/lib/utils.js';

const fleetItems = [
  { to: '/contracting/fleet', title: 'Machines' },
  { to: '/contracting/fleet/categories', title: 'Categories' },
  { to: '/contracting/fleet/implements', title: 'Implements' },
] as const;

const inactiveItemClass = 'text-sidebar-foreground/55';
const biggerIconClass = '[&_svg]:size-5';
const activeSubMarkerClass =
  'relative overflow-visible data-active:before:absolute data-active:before:-left-2.5 data-active:before:inset-y-0.5 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-sidebar-foreground';

export function AppNavMain() {
  const canReviewReadings = useCan('contracting_reading:update').can;
  const canReadFleet = useCan('contracting_machine:read').can;
  const { setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [open, setOpen] = useState(true);
  const fleetActive = pathname.startsWith('/contracting/fleet');

  return (
    <>
      <SidebarGroup>
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <Link to="/contracting" activeOptions={{ exact: true }} onClick={() => setOpenMobile(false)}>
              {({ isActive }) => (
                <SidebarMenuButton
                  isActive={isActive}
                  render={<span />}
                  tooltip="Dashboard"
                  className={cn(biggerIconClass, !isActive && inactiveItemClass)}
                >
                  <IconGauge />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              )}
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {canReadFleet || canReviewReadings ? (
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {canReviewReadings ? (
              <SidebarMenuItem>
                <Link to="/contracting/readings/exceptions" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton
                    render={<span />}
                    isActive={pathname.startsWith('/contracting/readings')}
                    tooltip="Reading exceptions"
                  >
                    <IconGauge />
                    <span>Reading exceptions</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ) : null}
            {canReadFleet ? (
              <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
                <Link to="/contracting/fleet" onClick={() => setOpen((value) => !value)}>
                  <SidebarMenuButton
                    isActive={fleetActive}
                    render={<span />}
                    tooltip="Fleet"
                    className={cn(biggerIconClass, !fleetActive && inactiveItemClass)}
                  >
                    <IconTractor />
                    <span>Fleet</span>
                    <IconChevronRight
                      aria-hidden="true"
                      className={cn('ml-auto size-4! transition-transform', open && 'rotate-90')}
                    />
                  </SidebarMenuButton>
                </Link>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {fleetItems.map((item) => {
                      const isActive =
                        item.to === '/contracting/fleet'
                          ? fleetActive && !pathname.includes('/categories') && !pathname.includes('/implements')
                          : pathname.startsWith(item.to);
                      return (
                        <SidebarMenuSubItem key={item.to}>
                          <Link to={item.to} onClick={() => setOpenMobile(false)}>
                            <SidebarMenuSubButton
                              isActive={isActive}
                              render={<span />}
                              className={cn(activeSubMarkerClass, !isActive && inactiveItemClass)}
                            >
                              <span>{item.title}</span>
                            </SidebarMenuSubButton>
                          </Link>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
    </>
  );
}
