import type { Business } from '@pkg/schema';
import type React from 'react';

import { ChangelogDialog } from '@/components/changelog/ChangelogDialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar.js';

type AuthenticatedRouteShellProps = {
  /** The business this shell is mounted for; the Changelog shown is that business's. */
  business: Business;
  children: React.ReactNode;
  sidebar: React.ReactNode;
};

export const AuthenticatedRouteShell: React.FC<AuthenticatedRouteShellProps> = ({ business, children, sidebar }) => {
  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      {sidebar}
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
          </div>
        </header>
        <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
      </SidebarInset>
      <ChangelogDialog business={business} />
    </SidebarProvider>
  );
};
