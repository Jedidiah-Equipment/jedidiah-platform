import { createRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { authClient, getCurrentSession } from "../features/auth/auth-client.js";
import { rootRoute } from "./__root.js";

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (!session) {
      throw redirect({
        to: "/login",
      });
    }

    return { session };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const userLabel = session?.user.name || session?.user.email || "Signed in";

  async function handleSignOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <section className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-300">
              Jedidiah Equipment
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">Dashboard</h1>
          </div>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:border-teal-300 hover:text-teal-200"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} />
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-neutral-400">Signed in as</p>
        <p className="mt-2 text-lg font-medium text-white">{isPending ? "Loading" : userLabel}</p>
      </div>
    </section>
  );
}
