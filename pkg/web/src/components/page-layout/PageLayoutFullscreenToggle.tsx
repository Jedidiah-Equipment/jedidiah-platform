import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type PageLayoutFullscreenToggleProps = {
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
};

export const PageLayoutFullscreenToggle: React.FC<PageLayoutFullscreenToggleProps> = ({
  fullscreen,
  onFullscreenChange,
}) => {
  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const Icon = fullscreen ? IconMinimize : IconMaximize;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={() => onFullscreenChange(!fullscreen)}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
