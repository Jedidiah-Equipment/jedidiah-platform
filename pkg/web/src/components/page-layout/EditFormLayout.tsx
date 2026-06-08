import type React from 'react';

import { cn } from '@/lib/utils.js';

function EditFormGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid w-full gap-5 lg:grid-cols-2', className)} {...props} />;
}

function EditFormFullWidth({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('lg:col-span-2', className)} {...props} />;
}

function EditFormActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <EditFormFullWidth className={cn('flex justify-end gap-2', className)} {...props} />;
}

export { EditFormActions, EditFormFullWidth, EditFormGrid };
