import { Link } from "@tanstack/react-router";
import { WrenchIcon } from "lucide-react";
import type React from "react";

import { DashboardNavMain } from "@/components/app-shell/DashboardNavMain.js";
import { DashboardNavSecondary } from "@/components/app-shell/DashboardNavSecondary.js";
import { DashboardNavUser } from "@/components/app-shell/DashboardNavUser.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar.js";

type DashboardSidebarProps = React.ComponentProps<typeof Sidebar> & {
  activePath: "/dashboard" | "/products";
  user: {
    name: string;
    email: string;
    initials: string;
  };
  onSignOut: () => void | Promise<void>;
};

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activePath,
  user,
  onSignOut,
  ...props
}) => {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/dashboard">Jedidiah Equipment</Link>} size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <WrenchIcon />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Jedidiah Equipment</span>
                <span className="truncate text-xs">Operations</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <DashboardNavMain activePath={activePath} />
        <DashboardNavSecondary className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <DashboardNavUser onSignOut={onSignOut} user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
