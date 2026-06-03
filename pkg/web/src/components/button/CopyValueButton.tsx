import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type CopyValueButtonProps = {
  label: string;
  value: string;
};

export function CopyValueButton({ label, value }: CopyValueButtonProps) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="shrink-0"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                .writeText(value)
                .then(() => {
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2_000);
                })
                .catch(() => {
                  toast.error('Unable to copy value.');
                });
            }}
          />
        }
      >
        {isCopied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
      </TooltipTrigger>
      <TooltipContent>{isCopied ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  );
}
