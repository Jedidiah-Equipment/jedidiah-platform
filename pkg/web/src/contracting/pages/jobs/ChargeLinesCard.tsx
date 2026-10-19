import type { JobSheet } from '@pkg/domain/contracting';
import type { JobDetail } from '@pkg/schema/contracting';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { AddChargeLineButton } from './ChargeLineEditing.js';
import { ChargeLinesTable } from './ChargeLinesTable.js';

export function ChargeLinesCard({
  job,
  editable,
  addAction,
  amountEditable,
}: {
  job: JobDetail;
  editable: boolean;
  addAction: ReturnType<JobSheet['action']>;
  amountEditable: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge lines</CardTitle>
        {addAction ? (
          <CardAction>
            <AddChargeLineButton jobId={job.id} action={addAction} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ChargeLinesTable
          lines={job.chargeLines}
          editable={editable}
          amountEditable={amountEditable}
          missingAmount="set-at-pricing"
        />
      </CardContent>
    </Card>
  );
}
