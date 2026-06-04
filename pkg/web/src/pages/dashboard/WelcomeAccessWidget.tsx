import type React from 'react';

import { PermissionBadge } from '@/components/common/PermissionBadge.js';
import { Badge } from '@/components/ui/badge.js';
import { Separator } from '@/components/ui/separator.js';
import { useAccess } from '@/hooks/use-access.js';
import { authClient } from '@/lib/auth-client.js';

import { DashboardWidgetEmpty, DashboardWidgetError, DashboardWidgetSkeleton } from './DashboardWidgetCard.js';

export const WelcomeAccessWidget: React.FC = () => {
  const { data: session, error: sessionError, isPending: isSessionPending } = authClient.useSession();
  const accessQuery = useAccess();
  const userLabel = session?.user.name || 'Signed in';
  const permissions = accessQuery.data?.permissions ?? [];

  if (sessionError) {
    return <DashboardWidgetError error={sessionError} fallbackMessage="Unable to load signed-in session." />;
  }

  if (accessQuery.error) {
    return <DashboardWidgetError error={accessQuery.error} fallbackMessage="Unable to load workspace access." />;
  }

  if (isSessionPending || accessQuery.isPending) {
    return <DashboardWidgetSkeleton />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Signed in as</span>
          <span className="text-lg font-medium">{userLabel}</span>
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Authentication</span>
          <Badge variant="secondary">Active</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">Workspace access</span>
        {permissions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {permissions.map((permission) => (
              <PermissionBadge key={permission} permission={permission} />
            ))}
          </div>
        ) : (
          <DashboardWidgetEmpty>No permissions assigned</DashboardWidgetEmpty>
        )}
      </section>
    </div>
  );
};
