import type React from 'react';
import { AppSidebar } from '@/components/app-shell/AppSidebar.js';
import { FloatingAssistant } from '@/components/assistant-ui/v2/FloatingAssistant.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.js';

type AuthenticatedRouteShellProps = {
  children: React.ReactNode;
};

export const AuthenticatedRouteShell: React.FC<AuthenticatedRouteShellProps> = ({ children }) => {
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
          </div>
        </header>
        <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
      </SidebarInset>
      <FloatingAssistant />
    </SidebarProvider>
  );
};
