import type React from "react";

import { AssistantPanel } from "./AssistantPanel.js";

export const AssistantPage: React.FC = () => {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <AssistantPanel />
    </div>
  );
};
