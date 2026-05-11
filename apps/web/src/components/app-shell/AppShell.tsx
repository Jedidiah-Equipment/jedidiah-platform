import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return <main className="min-h-screen bg-neutral-950 text-neutral-50">{children}</main>;
}
