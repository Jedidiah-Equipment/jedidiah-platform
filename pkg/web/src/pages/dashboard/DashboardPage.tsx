import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import type React from "react";

import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Separator } from "@/components/ui/separator.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { authClient } from "@/lib/auth-client.js";

type DashboardPageProps = Record<string, never>;

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const userLabel = session?.user.name || session?.user.email || "Signed in";

  async function handleSignOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <section className="min-h-screen">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
              Jedidiah Equipment
            </p>
            <h1 className="font-heading text-xl font-semibold">Dashboard</h1>
          </div>

          <Button onClick={handleSignOut} type="button" variant="outline">
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardDescription>Account</CardDescription>
            <CardTitle>Signed in session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Separator />
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Signed in as</span>
              {isPending ? (
                <Skeleton className="h-6 w-56" />
              ) : (
                <span className="text-lg font-medium">{userLabel}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle>Workspace access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Authentication</span>
              <Badge variant="secondary">{isPending ? "Checking" : "Active"}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
