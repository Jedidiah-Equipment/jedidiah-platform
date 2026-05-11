import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/pages/dashboard/DashboardPage.js";

export const Route = createFileRoute("/_authed/dashboard")({
  staticData: {
    pageLabel: "Dashboard",
  },
  component: DashboardPage,
});
