import { Loader2Icon } from "lucide-react";
import type React from "react";

import { Button } from "@/components/ui/button.js";
import { DialogFooter } from "@/components/ui/dialog.js";

type SubmitFooterProps = {
  isPending: boolean;
  label: string;
};

export const SubmitFooter: React.FC<SubmitFooterProps> = ({ isPending, label }) => (
  <DialogFooter className="mt-4" showCloseButton>
    <Button disabled={isPending} type="submit">
      {isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
      {label}
    </Button>
  </DialogFooter>
);
