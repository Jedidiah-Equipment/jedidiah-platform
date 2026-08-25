import { IconFilterOff } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';

/**
 * The way out of a narrowed list, wherever one is offered. Outlined in the primary colour rather
 * than ghosted: it appears only once filters are on, so it is the one control on the bar that is
 * reporting a state as well as offering an action.
 */
export const ResetFiltersButton: React.FC<{
  label?: string;
  onReset: () => void;
}> = ({ label = 'Reset filters', onReset }) => (
  <Button
    className="border-primary/50 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
    onClick={onReset}
    size="xs"
    type="button"
    variant="outline"
  >
    <IconFilterOff data-icon="inline-start" />
    {label}
  </Button>
);
