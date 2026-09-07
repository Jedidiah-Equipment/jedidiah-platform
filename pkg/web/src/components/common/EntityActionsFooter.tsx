import type { ReactNode } from 'react';

export function EntityActionsFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>;
}
