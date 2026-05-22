import { departmentLabels } from '@pkg/domain';
import { DEPARTMENTS, type Department, type Station } from '@pkg/schema';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, LoaderCircleIcon, PlusIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DepartmentIcon } from '@/components/departments/index.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Switch } from '@/components/ui/switch.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

export const StationsPage: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();

  const canMutateStations = useCan('station:update').can;

  const stationsQuery = useQuery(
    trpc.stations.list.queryOptions(
      {},
      {
        placeholderData: keepPreviousData,
      },
    ),
  );
  const stationsByDepartment = useMemo(() => groupStationsByDepartment(stationsQuery.data ?? []), [stationsQuery.data]);

  const createStationMutation = useMutation(
    trpc.stations.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.stations.list.queryFilter());
        toast.success('Station created');
      },
      onError: (error) => showMutationError(error, 'Unable to create station.'),
    }),
  );
  const updateStationMutation = useMutation(
    trpc.stations.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.stations.list.queryFilter());
        toast.success('Station updated');
      },
      onError: (error) => showMutationError(error, 'Unable to update station.'),
    }),
  );
  const setStationActiveMutation = useMutation(
    trpc.stations.setActive.mutationOptions({
      onSuccess: async (_station, input) => {
        await queryClient.invalidateQueries(trpc.stations.list.queryFilter());
        toast.success(input.isActive ? 'Station reactivated' : 'Station deactivated');
      },
      onError: (error) => showMutationError(error, 'Unable to update station status.'),
    }),
  );

  return (
    <ListPageLayout description="Operations" title="Stations">
      {stationsQuery.isPending ? <StationCatalogSkeleton /> : null}
      {stationsQuery.error ? (
        <p className="text-sm text-destructive">
          {getApiQueryErrorMessage(stationsQuery.error, 'Unable to load stations.')}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {DEPARTMENTS.map((department) => (
          <section className="rounded-lg border bg-background" key={department}>
            <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <DepartmentIcon className="size-5 shrink-0 text-muted-foreground" department={department} />
                <h2 className="truncate font-heading font-medium">{departmentLabels[department]}</h2>
              </div>
              <Badge variant="outline">{stationsByDepartment[department].length}</Badge>
            </header>
            <div className="flex flex-col gap-3 p-4">
              {canMutateStations ? (
                <CreateStationForm
                  department={department}
                  isPending={createStationMutation.isPending}
                  onCreate={(input) => createStationMutation.mutateAsync(input)}
                />
              ) : null}
              <div className="flex flex-col gap-2">
                {stationsByDepartment[department].map((station) => (
                  <StationRow
                    canMutate={canMutateStations}
                    isActivePending={setStationActiveMutation.isPending}
                    isUpdatePending={updateStationMutation.isPending}
                    key={station.id}
                    onSetActive={(input) => setStationActiveMutation.mutateAsync(input)}
                    onUpdate={(input) => updateStationMutation.mutateAsync(input)}
                    station={station}
                  />
                ))}
                {stationsByDepartment[department].length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    No stations
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </ListPageLayout>
  );
};

type CreateStationFormProps = {
  department: Department;
  isPending: boolean;
  onCreate: (input: { department: Department; displayOrder: number; name: string }) => Promise<unknown>;
};

const CreateStationForm: React.FC<CreateStationFormProps> = ({ department, isPending, onCreate }) => {
  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState(10);
  const canSubmit = name.trim().length > 0 && !isPending;

  return (
    <form
      className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_92px_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        await onCreate({ department, displayOrder, name });
        setName('');
        setDisplayOrder((value) => value + 10);
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`station-name-${department}`}>Name</Label>
        <Input
          id={`station-name-${department}`}
          onChange={(event) => setName(event.target.value)}
          placeholder="New station"
          value={name}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`station-order-${department}`}>Order</Label>
        <Input
          id={`station-order-${department}`}
          min={0}
          onChange={(event) => setDisplayOrder(parseDisplayOrderInput(event.target.value))}
          type="number"
          value={displayOrder}
        />
      </div>
      <Button className="self-end" disabled={!canSubmit} type="submit">
        <PlusIcon data-icon="inline-start" />
        Add
      </Button>
    </form>
  );
};

type StationRowProps = {
  canMutate: boolean;
  isActivePending: boolean;
  isUpdatePending: boolean;
  onSetActive: (input: { id: string; isActive: boolean }) => Promise<unknown>;
  onUpdate: (input: { id: string; displayOrder: number; name: string }) => Promise<unknown>;
  station: Station;
};

const StationRow: React.FC<StationRowProps> = ({
  canMutate,
  isActivePending,
  isUpdatePending,
  onSetActive,
  onUpdate,
  station,
}) => {
  const [name, setName] = useState(station.name);
  const [displayOrder, setDisplayOrder] = useState(station.displayOrder);
  const isDirty = name !== station.name || displayOrder !== station.displayOrder;
  const canSave = canMutate && name.trim().length > 0 && isDirty && !isUpdatePending;

  useEffect(() => {
    setName(station.name);
    setDisplayOrder(station.displayOrder);
  }, [station.displayOrder, station.name]);

  return (
    <div
      className={cn(
        'grid gap-2 rounded-md border p-3 sm:grid-cols-[76px_minmax(0,1fr)_auto_auto] sm:items-end',
        station.isActive ? 'bg-background' : 'bg-muted/40 text-muted-foreground',
      )}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`station-order-${station.id}`}>Order</Label>
        <Input
          disabled={!canMutate}
          id={`station-order-${station.id}`}
          min={0}
          onChange={(event) => setDisplayOrder(parseDisplayOrderInput(event.target.value))}
          type="number"
          value={displayOrder}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={`station-name-${station.id}`}>Name</Label>
        <Input
          disabled={!canMutate}
          id={`station-name-${station.id}`}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </div>
      {canMutate ? (
        <div className="flex items-center gap-2 pb-2 sm:justify-center">
          <Switch
            aria-label={`${station.name} active`}
            checked={station.isActive}
            disabled={isActivePending}
            onCheckedChange={(checked) => onSetActive({ id: station.id, isActive: checked })}
          />
          <span className="text-sm">{station.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      ) : (
        <Badge className="self-center" variant={station.isActive ? 'default' : 'secondary'}>
          {station.isActive ? 'Active' : 'Inactive'}
        </Badge>
      )}
      {canMutate ? (
        <div className="flex gap-2 sm:justify-end">
          <Button
            aria-label={`Reset ${station.name}`}
            disabled={!isDirty || isUpdatePending}
            onClick={() => {
              setName(station.name);
              setDisplayOrder(station.displayOrder);
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon />
          </Button>
          <Button
            aria-label={`Save ${station.name}`}
            disabled={!canSave}
            onClick={() => {
              void onUpdate({ id: station.id, displayOrder, name }).catch(() => undefined);
            }}
            size="icon"
            type="button"
          >
            {isUpdatePending ? <LoaderCircleIcon className="animate-spin" /> : isDirty ? <SaveIcon /> : <CheckIcon />}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

function groupStationsByDepartment(stations: readonly Station[]): Record<Department, Station[]> {
  return Object.fromEntries(
    DEPARTMENTS.map((department) => [department, stations.filter((station) => station.department === department)]),
  ) as Record<Department, Station[]>;
}

function parseDisplayOrderInput(value: string): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function StationCatalogSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {DEPARTMENTS.map((department) => (
        <Skeleton className="h-48 rounded-lg" key={department} />
      ))}
    </div>
  );
}
