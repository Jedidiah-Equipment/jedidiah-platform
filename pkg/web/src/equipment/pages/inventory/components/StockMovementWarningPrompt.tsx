import { warningMessageFor } from '@pkg/domain/equipment';
import type { StockMovementWarningCode } from '@pkg/schema/equipment';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';

export function StockMovementWarningPrompt({ warnings }: { warnings: readonly StockMovementWarningCode[] }) {
  if (warnings.length === 0) return null;

  return (
    <Alert className="border-warning/45 bg-warning/10 text-warning-foreground">
      <IconAlertTriangle />
      <AlertTitle>Check this movement</AlertTitle>
      <AlertDescription className="text-warning-foreground/85">
        <ul className="list-disc pl-4">
          {warnings.map((warning) => (
            <li key={warning}>{warningMessageFor(warning)}</li>
          ))}
        </ul>
        <p className="mt-1">You can still post this movement.</p>
      </AlertDescription>
    </Alert>
  );
}
