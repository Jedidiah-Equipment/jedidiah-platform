import type React from 'react';
import { Skeleton } from '@/components/ui/skeleton.js';
import { ErrorMessage } from './ErrorMessage.js';

export function EditFormSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

type QueryContentProps<TData> = {
  children: (data: TData) => React.ReactNode;
  errorMessage: string;
  query: { data: TData | undefined; error: unknown; isPending: boolean };
};

/** A single-entity query's load states: a skeleton while pending, its error, then the loaded content. */
export function QueryContent<TData>({ children, errorMessage, query }: QueryContentProps<TData>) {
  return (
    <>
      <ErrorMessage error={query.error} fallbackMessage={errorMessage} />
      {query.data !== undefined ? children(query.data) : query.isPending ? <EditFormSkeleton /> : null}
    </>
  );
}
