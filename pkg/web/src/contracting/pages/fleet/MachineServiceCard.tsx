import { machineServiceBadge, serviceRecordSummary } from '@pkg/domain/contracting';
import type { Machine } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { HoursToServiceLabel, machineHoursToService } from '@/contracting/components/MachineServiceDue.js';
import { StatusChip } from '@/contracting/components/StatusChip.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { BookServiceDialog } from './BookServiceDialog.js';
import { SpotCaptureDialog } from './SpotCaptureDialog.js';
import { useServiceMechanicOptions } from './use-service-mechanic-options.js';

/**
 * The Machine's service settings and current hours, where it stands on service, and a line for each service still in
 * the workshop linking to its page; the Services tab lists every Service Record.
 */
export function MachineServiceCard({ machine, children }: { machine: Machine; children: ReactNode }) {
  const trpc = useTRPC();
  const readsServices = useCan('contracting_service:read').can;
  const canBook = useCan('contracting_service:update').can && readsServices && !machine.retiredAt;
  const canCapture = useCan('contracting_reading:capture').can && !machine.retiredAt;
  const records = useQuery(
    trpc.contractingServices.list.queryOptions(
      { machineIds: [machine.id], statuses: ['open'], limit: 0 },
      { enabled: readsServices },
    ),
  );
  const mechanics = useServiceMechanicOptions(canBook);
  const [opening, setOpening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const toGo = machineHoursToService(machine);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Services
          {readsServices ? <StatusChip {...machineServiceBadge(machine)} /> : null}
          {readsServices && toGo ? <HoursToServiceLabel {...toGo} className="text-sm font-normal" /> : null}
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          {canCapture ? (
            <Button variant="outline" onClick={() => setCapturing(true)}>
              Capture hours
            </Button>
          ) : null}
          {canBook ? <Button onClick={() => setOpening(true)}>Book a service</Button> : null}
          {readsServices ? <HelpLink label="How to book a service" topic="contractingMachineService" /> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <ErrorMessage error={records.error ?? mechanics.error} fallbackMessage="Unable to load Service Records." />
        {records.data?.items.map((record) => (
          <div key={record.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span className="font-medium">{serviceRecordSummary(record)}</span>
            <PrimaryLink to="/contracting/services/$id" params={{ id: record.id }}>
              Open service
            </PrimaryLink>
          </div>
        ))}
      </CardContent>
      {capturing ? <SpotCaptureDialog machine={machine} onClose={() => setCapturing(false)} /> : null}
      {opening ? (
        <BookServiceDialog
          machineId={machine.id}
          mechanicOptions={mechanics.options}
          onClose={() => setOpening(false)}
        />
      ) : null}
    </Card>
  );
}
