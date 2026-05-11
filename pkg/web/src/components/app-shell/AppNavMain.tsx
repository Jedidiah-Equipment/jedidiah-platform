import { Link, linkOptions } from "@tanstack/react-router";
import { BoxesIcon, GaugeIcon } from "lucide-react";
import type React from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";

const mainNavItems = [
  {
    title: "Dashboard",
    link: linkOptions({ to: "/dashboard" }),
    icon: GaugeIcon,
  },
  {
    title: "Products",
    link: linkOptions({
      to: "/products",
      search: { page: 1, pageSize: 10, sortBy: "name", sortDirection: "asc" },
    }),
    icon: BoxesIcon,
  },
] as const;

export const AppNavMain: React.FC = () => {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {mainNavItems.map((item) => (
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
