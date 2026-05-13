import { createFileRoute } from "@tanstack/react-router";

import { AssistantPage } from "@/pages/assistant/AssistantPage.js";

export const Route = createFileRoute("/_authed/assistant")({
  staticData: {
    pageLabel: "Assistant",
  },
  component: AssistantPage,
});
