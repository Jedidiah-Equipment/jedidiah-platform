import type React from 'react';
import type { ReactNode } from 'react';

type AppShellProps = {
  children: ReactNode;
};

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return <main className="min-h-screen bg-background text-foreground">{children}</main>;
};
