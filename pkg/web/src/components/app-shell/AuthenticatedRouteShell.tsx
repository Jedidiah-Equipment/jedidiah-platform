import { Link, useMatches } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "lucide-react";
import type React from "react";
import { AppSidebar } from "@/components/app-shell/AppSidebar.js";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.js";
import { Button } from "@/components/ui/button.js";
import { Separator } from "@/components/ui/separator.js";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.js";
import { useTheme } from "@/hooks/use-theme.js";

type AuthenticatedRouteShellProps = {
  children: React.ReactNode;
};

export const AuthenticatedRouteShell: React.FC<AuthenticatedRouteShellProps> = ({ children }) => {
  const { setTheme, theme } = useTheme();
  const isDark = theme === "dark";
  const currentPage = useMatches({
    select: (matches) =>
      matches.findLast((match) => match.staticData.pageLabel)?.staticData.pageLabel ?? "Dashboard",
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              orientation="vertical"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink render={<Link to="/dashboard" />}>
                    Jedidiah Equipment
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentPage}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
            <Button
              aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
              aria-pressed={isDark}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {isDark ? (
                <SunIcon aria-hidden="true" data-icon="inline-start" />
              ) : (
                <MoonIcon aria-hidden="true" data-icon="inline-start" />
              )}
            </Button>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
};
