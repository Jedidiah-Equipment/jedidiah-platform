import { IconAlertTriangle } from '@tabler/icons-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';

import type { JobMovementWarningCode } from './types.js';

const warningMessages = {
  'exceeds-cfo': 'This draw exceeds the Job CFO.',
  'exceeds-drawn': 'This return exceeds the quantity currently drawn.',
  'negative-stock-on-hand': 'This draw will take stock on hand negative.',
} as const satisfies Record<JobMovementWarningCode, string>;

export function StockMovementWarningPrompt({ warnings }: { warnings: readonly JobMovementWarningCode[] }) {
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

export function warningMessageFor(code: JobMovementWarningCode): string {
  return warningMessages[code];
}
