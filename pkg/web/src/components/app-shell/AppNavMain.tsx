import { type AppPermission, hasPermission } from "@pkg/schema";
import { Link, linkOptions } from "@tanstack/react-router";
import { BoxesIcon, GaugeIcon, type LucideIcon, UsersIcon } from "lucide-react";
import type React from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";
import { useAccess } from "@/hooks/use-access.js";

type MainNavItem = {
  title: string;
  permission?: AppPermission;
  link: ReturnType<typeof linkOptions>;
  icon: LucideIcon;
};

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
] as const satisfies readonly MainNavItem[];

export const AppNavMain: React.FC = () => {
  const accessQuery = useAccess();
  const visibleNavItems = mainNavItems.filter(
    (item) => !("permission" in item) || hasPermission(accessQuery.data, item.permission),
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
