import { Link } from "@tanstack/react-router";
import { WrenchIcon } from "lucide-react";
import type React from "react";

import { AppNavMain } from "@/components/app-shell/AppNavMain.js";
import { AppNavSecondary } from "@/components/app-shell/AppNavSecondary.js";
import { AppNavUser } from "@/components/app-shell/AppNavUser.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";
import { useAuth } from "@/hooks/use-auth.js";

type AppSidebarProps = React.ComponentProps<typeof Sidebar>;

export const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { onSignOut, user } = useAuth();

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
        <AppNavMain />
        <AppNavSecondary className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <AppNavUser onSignOut={onSignOut} user={user} />
      </SidebarFooter>
    </Sidebar>
  );
};
