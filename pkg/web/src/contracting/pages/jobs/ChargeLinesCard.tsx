import type { JobDetail } from '@pkg/schema/contracting';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { AddChargeLineDialog, useChargeLineMutations } from './ChargeLineEditing.js';
import { ChargeLinesTable } from './ChargeLinesTable.js';

export function ChargeLinesCard({
  job,
  editable,
  addAction,
  amountEditable,
}: {
  job: JobDetail;
  editable: boolean;
  addAction: { disabled: boolean; title: string | undefined } | null;
  amountEditable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const mutations = useChargeLineMutations();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Charge lines</CardTitle>
          {addAction ? (
            <CardAction>
              <Button {...addAction} onClick={() => setAdding(true)}>
                Add charge line
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <ErrorMessage
            error={mutations.create.error ?? mutations.patch.error ?? mutations.remove.error}
            fallbackMessage="Unable to update Charge Lines."
          />
          <ChargeLinesTable
            lines={job.chargeLines}
            editable={editable}
            amountEditable={amountEditable}
            missingAmount="set-at-pricing"
            mutations={mutations}
          />
        </CardContent>
      </Card>
      <AddChargeLineDialog jobId={job.id} open={adding} onOpenChange={setAdding} create={mutations.create} />
    </>
  );
}
