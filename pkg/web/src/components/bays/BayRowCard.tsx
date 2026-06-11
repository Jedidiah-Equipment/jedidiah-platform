import { departmentLabels } from '@pkg/domain';
import type { Bay } from '@pkg/schema';
import { IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';

type BayRowCardProps = {
  bay: Bay | undefined;
  children: React.ReactNode;
  onRemove: () => void;
  removeDisabled?: boolean;
  removeLabel: string;
  unavailableHint: string;
};

export const BayRowCard: React.FC<BayRowCardProps> = ({
  bay,
  children,
  onRemove,
  removeDisabled,
  removeLabel,
  unavailableHint,
}) => (
  <Card size="sm">
    <CardContent>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0 self-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium">{bay?.name ?? 'Unavailable Bay'}</span>
            {bay?.disabledAt ? <Badge variant="outline">Disabled</Badge> : null}
          </div>
          <p className="text-muted-foreground text-xs font-mono">
            {bay ? departmentLabels[bay.department] : unavailableHint}
          </p>
        </div>
        {children}
        <Button
          aria-label={removeLabel}
          className="self-center"
          disabled={removeDisabled}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconTrash />
        </Button>
      </div>
    </CardContent>
  </Card>
);
