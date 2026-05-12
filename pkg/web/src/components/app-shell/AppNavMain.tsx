import { Link, linkOptions } from "@tanstack/react-router";
import { BoxesIcon, GaugeIcon, UsersIcon } from "lucide-react";
import type React from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";
import { useAccess } from "@/hooks/use-access.js";
import { canAccess } from "@/lib/access.js";

const mainNavItems = [
  {
    title: "Dashboard",
    link: linkOptions({ to: "/dashboard" }),
    icon: GaugeIcon,
  },
  {
    title: "Products",
    permission: "product:read",
    link: linkOptions({
      to: "/products",
      search: { page: 1, pageSize: 10, search: "", sortBy: "name", sortDirection: "asc" },
    }),
    icon: BoxesIcon,
  },
  {
    title: "Users",
    permission: "user:list",
    link: linkOptions({ to: "/users" }),
    icon: UsersIcon,
  },
] as const;

export const AppNavMain: React.FC = () => {
  const accessQuery = useAccess();
  const visibleNavItems = mainNavItems.filter(
    (item) => !("permission" in item) || canAccess(accessQuery.data, item.permission),
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
