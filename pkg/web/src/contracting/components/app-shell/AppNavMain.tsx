import {
  IconBuilding,
  IconCategory,
  IconChevronRight,
  IconGauge,
  IconTools,
  IconTractor,
  IconUsers,
} from '@tabler/icons-react';
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
  { to: '/contracting/fleet/implements', title: 'Implements' },
] as const;

const inactiveItemClass = 'text-sidebar-foreground/55';
const biggerIconClass = '[&_svg]:size-5';
const activeSubMarkerClass =
  'relative overflow-visible data-active:before:absolute data-active:before:-left-2.5 data-active:before:inset-y-0.5 data-active:before:w-0.5 data-active:before:rounded-full data-active:before:bg-sidebar-foreground';

export function AppNavMain() {
  const canReviewReadings = useCan('contracting_reading:update').can;
  const canReadDirectory = useCan('contracting_directory:read').can;
  const canReadFleet = useCan('contracting_machine:read').can;
  const canListUsers = useCan('user:list').can;
  const { setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [open, setOpen] = useState(true);
  const categoriesActive = pathname.startsWith('/contracting/fleet/categories');
  const fleetActive = pathname.startsWith('/contracting/fleet') && !categoriesActive;

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
      {canReadFleet || canReviewReadings || canReadDirectory ? (
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarMenu className="gap-1">
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
                          ? fleetActive && !pathname.includes('/implements')
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
            {canReadDirectory ? (
              <SidebarMenuItem>
                <Link to="/contracting/customers" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton
                    render={<span />}
                    isActive={pathname.startsWith('/contracting/customers')}
                    tooltip="Customers"
                  >
                    <IconBuilding />
                    <span>Customers</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
      {canReadFleet || canReadDirectory || canListUsers ? (
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarMenu>
            {canListUsers ? (
              <SidebarMenuItem>
                <Link to="/contracting/users" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton
                    render={<span />}
                    isActive={pathname.startsWith('/contracting/users')}
                    tooltip="Users"
                  >
                    <IconUsers />
                    <span>Users</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ) : null}
            {canReadFleet ? (
              <SidebarMenuItem>
                <Link to="/contracting/fleet/categories" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton render={<span />} isActive={categoriesActive} tooltip="Categories">
                    <IconCategory />
                    <span>Categories</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ) : null}
            {canReadDirectory ? (
              <SidebarMenuItem>
                <Link to="/contracting/work-types" onClick={() => setOpenMobile(false)}>
                  <SidebarMenuButton
                    render={<span />}
                    isActive={pathname.startsWith('/contracting/work-types')}
                    tooltip="Work types"
                  >
                    <IconTools />
                    <span>Work types</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      ) : null}
    </>
  );
}
