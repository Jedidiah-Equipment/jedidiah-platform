import { Link } from "@tanstack/react-router";
import { BoxesIcon, GaugeIcon, type LucideIcon } from "lucide-react";
import type React from "react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.js";

type AppRoutePath = "/dashboard" | "/products";

type NavMainItem = {
  title: string;
  to: AppRoutePath;
  icon: LucideIcon;
};

const mainNavItems: NavMainItem[] = [
  {
    title: "Dashboard",
    to: "/dashboard",
    icon: GaugeIcon,
  },
  {
    title: "Products",
    to: "/products",
    icon: BoxesIcon,
  },
];

type DashboardNavMainProps = {
  activePath: AppRoutePath;
};

export const DashboardNavMain: React.FC<DashboardNavMainProps> = ({ activePath }) => {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {mainNavItems.map((item) => {
          const isActive = item.to === activePath;

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={isActive}
                render={<Link to={item.to}>{item.title}</Link>}
                tooltip={item.title}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};
