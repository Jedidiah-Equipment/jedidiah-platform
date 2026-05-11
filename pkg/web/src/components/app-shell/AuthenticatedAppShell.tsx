import { Link, useNavigate } from "@tanstack/react-router";
import type React from "react";
import type { ReactNode } from "react";

import { DashboardSidebar } from "@/components/app-shell/DashboardSidebar.js";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb.js";
import { Separator } from "@/components/ui/separator.js";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.js";
import { authClient } from "@/lib/auth-client.js";

type AuthenticatedAppShellProps = {
  activePath: "/dashboard" | "/products";
  children: ReactNode;
  currentPage: string;
};

export const AuthenticatedAppShell: React.FC<AuthenticatedAppShellProps> = ({
  activePath,
  children,
  currentPage,
}) => {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const userName = session?.user.name || "Signed in";
  const userEmail = session?.user.email || "Account active";
  const userInitials = getInitials(userName, userEmail);

  async function handleSignOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <SidebarProvider>
      <DashboardSidebar
        activePath={activePath}
        onSignOut={handleSignOut}
        user={{
          name: userName,
          email: userEmail,
          initials: userInitials,
        }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
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
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
};

function getInitials(name: string, email: string) {
  const source = name === "Signed in" ? email : name;
  const parts = source
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (parts[0]?.[0] ?? "J").concat(parts[1]?.[0] ?? "E").toUpperCase();
}
