import type React from 'react';

import { cn } from '@/lib/utils.js';

/** A detail page's main column beside its aside (Activity, History): 60/40 from `xl`, the aside below it before then. */
export function DetailAsideGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]', className)} {...props} />
  );
}
