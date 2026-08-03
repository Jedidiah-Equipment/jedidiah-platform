import type { UUID } from '@pkg/schema';
import { IconPrinter } from '@tabler/icons-react';
import type React from 'react';

import { Button, type ButtonSize } from '@/components/ui/button.js';
import { partLabelUrl } from './part-label.js';

type PartLabelPrintButtonProps = {
  partId: UUID;
  size?: ButtonSize;
};

// Kept as a standalone affordance so receiving ticket #1054 can mount the same single-Part action.
export const PartLabelPrintButton: React.FC<PartLabelPrintButtonProps> = ({ partId, size = 'default' }) => (
  <Button
    render={<a href={partLabelUrl(partId)} rel="noreferrer" target="_blank" />}
    size={size}
    type="button"
    variant="outline"
  >
    <IconPrinter data-icon="inline-start" />
    Print label
  </Button>
);
