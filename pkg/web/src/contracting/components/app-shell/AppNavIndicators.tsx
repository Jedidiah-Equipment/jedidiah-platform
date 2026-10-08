import { formatNumber } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { NavWarningDot } from '@/components/app-shell/NavWarningDot.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

// A background AI check can raise an exception after the capture, with nobody acting, so the dot asks again.
const READING_EXCEPTIONS_REFETCH_INTERVAL_MS = 60_000;

export const ReadingExceptionsNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const readingAccess = useCan('contracting_reading:update');
  const exceptionsQuery = useQuery({
    ...trpc.contractingReadings.listExceptions.queryOptions(),
    enabled: readingAccess.can,
    refetchInterval: READING_EXCEPTIONS_REFETCH_INTERVAL_MS,
  });
  const count = exceptionsQuery.data?.length ?? 0;

  return count > 0 ? (
    <NavWarningDot
      label={`${formatNumber(count)} ${count === 1 ? 'reading exception needs' : 'reading exceptions need'} review`}
    />
  ) : null;
};

// A Foreman reports from the field with nobody at the desk acting, so the dot asks again.
const WORKSHOP_REFETCH_INTERVAL_MS = 60_000;

export const WorkshopNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const breakdownAccess = useCan('contracting_breakdown:read');
  const summaryQuery = useQuery({
    ...trpc.contractingBreakdowns.queueSummary.queryOptions(),
    enabled: breakdownAccess.can,
    refetchInterval: WORKSHOP_REFETCH_INTERVAL_MS,
  });
  const count = summaryQuery.data?.codeRedUnsolved ?? 0;

  return count > 0 ? (
    <NavWarningDot
      label={`${formatNumber(count)} Code Red ${count === 1 ? 'Breakdown' : 'Breakdowns'} not yet Fixed`}
    />
  ) : null;
};
