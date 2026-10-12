import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { cn } from '@/lib/utils.js';

import type { DashboardWidgetSize } from './dashboard-widget-types.js';

type DashboardWidgetCardProps = {
  children: ReactNode;
  className?: string;
  size: DashboardWidgetSize;
  title: string;
};

export function DashboardWidgetCard({ children, className, size, title }: DashboardWidgetCardProps) {
  return (
    <Card className={cn(dashboardWidgetSizeClassNames[size], className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-32 flex-col">
        <DashboardWidgetErrorBoundary>{children}</DashboardWidgetErrorBoundary>
      </CardContent>
    </Card>
  );
}

export function DashboardWidgetSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-5 w-64 max-w-full" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

export function DashboardWidgetEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}

export function DashboardWidgetError({ error, fallbackMessage }: { error: unknown; fallbackMessage: string }) {
  return (
    <div className="flex min-h-24 items-center rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {getApiQueryErrorMessage(error, fallbackMessage) ?? fallbackMessage}
    </div>
  );
}

const dashboardWidgetSizeClassNames = {
  lg: 'md:col-span-6 xl:col-span-8',
  md: 'md:col-span-6',
  sm: 'md:col-span-3 xl:col-span-4',
  xl: 'md:col-span-6 xl:col-span-12',
  xs: 'md:col-span-3',
} as const satisfies Record<DashboardWidgetSize, string>;

type DashboardWidgetErrorBoundaryProps = {
  children: ReactNode;
};

type DashboardWidgetErrorBoundaryState = {
  error: unknown;
};

class DashboardWidgetErrorBoundary extends Component<
  DashboardWidgetErrorBoundaryProps,
  DashboardWidgetErrorBoundaryState
> {
  override state: DashboardWidgetErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): DashboardWidgetErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Dashboard widget failed to render.', error, errorInfo);
  }

  override render() {
    if (this.state.error) {
      return <DashboardWidgetError error={this.state.error} fallbackMessage="Unable to load dashboard widget." />;
    }

    return this.props.children;
  }
}
