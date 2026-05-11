import { createFileRoute, redirect } from "@tanstack/react-router";

import { getCurrentSession } from "@/lib/auth-client.js";
import { LoginPage } from "@/pages/login/LoginPage.js";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getCurrentSession();

    if (session) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
  component: LoginPage,
});
