import { createFileRoute } from "@tanstack/react-router";

import { UsersPage } from "@/pages/users/UsersPage.js";

export const Route = createFileRoute("/_authed/users")({
  staticData: {
    pageLabel: "Users",
  },
  component: UsersPage,
});
