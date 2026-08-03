import type { StockMovementWarningCode } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';

const warningMessages = {
  'exceeds-cfo': 'This draw exceeds the Job CFO.',
  'exceeds-drawn': 'This return exceeds the quantity currently drawn.',
  'exceeds-ordered': 'This receipt takes the line past the quantity ordered.',
  'negative-stock-on-hand': 'This draw will take stock on hand negative.',
} as const satisfies Record<StockMovementWarningCode, string>;

export function StockMovementWarningPrompt({ warnings }: { warnings: readonly StockMovementWarningCode[] }) {
  if (warnings.length === 0) return null;

  return (
    <Alert className="border-warning/45 bg-warning/10 text-warning-foreground">
      <IconAlertTriangle />
      <AlertTitle>Check this movement</AlertTitle>
      <AlertDescription className="text-warning-foreground/85">
        <ul className="list-disc pl-4">
          {warnings.map((warning) => (
            <li key={warning}>{warningMessages[warning]}</li>
          ))}
        </ul>
        <p className="mt-1">You can still post this movement.</p>
      </AlertDescription>
    </Alert>
  );
}

export function warningMessageFor(code: StockMovementWarningCode): string {
  return warningMessages[code];
}
