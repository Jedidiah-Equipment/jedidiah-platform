import type { AppRole } from "@pkg/schema";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { UsersPage } from "@/pages/users/UsersPage.js";

export const Route = createFileRoute("/_authed/users")({
  beforeLoad: ({ context }) => {
    const role = (context.session.user as { role?: unknown }).role;

    if (!hasRole(role, "admin")) {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
  staticData: {
    pageLabel: "Users",
  },
  component: UsersPage,
});

function hasRole(role: unknown, expectedRole: AppRole): boolean {
  if (Array.isArray(role)) {
    return role.some((value) => hasRole(value, expectedRole));
  }

  if (typeof role !== "string") {
    return false;
  }

  return role
    .split(",")
    .map((value) => value.trim())
    .includes(expectedRole);
}
