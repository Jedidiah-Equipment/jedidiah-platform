import type React from 'react';

import { PermissionBadge } from '@/components/PermissionBadge.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { authClient } from '@/lib/auth-client.js';

type DashboardPageProps = Record<string, never>;

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const { data: session, isPending } = authClient.useSession();
  const accessQuery = useAccess();
  const userLabel = session?.user.name || session?.user.email || 'Signed in';
  const permissions = accessQuery.data?.permissions ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardDescription>Account</CardDescription>
            <CardTitle>Signed in session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Signed in as</span>
              {isPending ? <Skeleton className="h-6 w-56" /> : <span className="text-lg font-medium">{userLabel}</span>}
            </div>
          </CardContent>
        </Card>

        <Card id="workspace-access">
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle>Workspace access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Authentication</span>
              <Badge variant="secondary">{isPending ? 'Checking' : 'Active'}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Permissions</span>
              {accessQuery.isPending ? (
                <div className="flex flex-wrap gap-1">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ) : permissions.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {permissions.map((permission) => (
                    <PermissionBadge key={permission} permission={permission} />
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No permissions assigned</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
