import { departmentLabels } from '@pkg/domain';
import {
  type FeedbackDetail,
  type FeedbackKind,
  type FeedbackListItem,
  type FeedbackStatus,
  FeedbackStatus as FeedbackStatusSchema,
  type FeedbackUpdateInput,
  type UUID,
} from '@pkg/schema';
import { keepPreviousData, skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { feedbackPageDescription } from '@/utils/page-descriptions.js';

const feedbackStatusLabels = {
  closed: 'Closed',
  open: 'Open',
  resolved: 'Resolved',
} as const satisfies Record<FeedbackStatus, string>;

const feedbackKindLabels = {
  general: 'General',
  'corrective-feedback-department': 'Corrective department',
  'corrective-feedback-user': 'Corrective user',
} as const satisfies Record<FeedbackKind, string>;

const detailHeaderBadgeClassName = 'h-6 px-2 text-xs';
const statusOptions = Object.entries(feedbackStatusLabels).map(([value, label]) => ({
  label,
  value: value as FeedbackStatus,
}));

const feedbackStatusBadgeClassNames = {
  closed: 'border-gray-400/50 bg-gray-500/10 text-gray-700 dark:text-gray-200',
  open: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200',
  resolved: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
} as const satisfies Record<FeedbackStatus, string>;

type FeedbackTriageFormValues = z.infer<typeof FeedbackTriageFormValues>;
const FeedbackTriageFormValues = z.object({
  internalNotes: z.string(),
  status: FeedbackStatusSchema,
});

export const FeedbackPage: React.FC = () => {
  const trpc = useTRPC();
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<UUID | null>(null);

  const feedbackQuery = useQuery(
    trpc.feedback.list.queryOptions(
      {},
      {
        placeholderData: keepPreviousData,
      },
    ),
  );
  const feedbackItems = feedbackQuery.data?.items ?? [];

  const detailQuery = useQuery(
    trpc.feedback.get.queryOptions(selectedFeedbackId ? { id: selectedFeedbackId } : skipToken),
  );

  return (
    <PageLayout description={feedbackPageDescription} title="Feedback">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <FeedbackInboxList
          errorMessage={getApiQueryErrorMessage(feedbackQuery.error, 'Unable to load feedback.')}
          feedback={feedbackItems}
          isLoading={feedbackQuery.isPending}
          selectedFeedbackId={selectedFeedbackId}
          onSelectFeedback={setSelectedFeedbackId}
        />
        <FeedbackDetailPanel
          detail={detailQuery.data ?? null}
          errorMessage={getApiQueryErrorMessage(detailQuery.error, 'Unable to load feedback detail.')}
          isLoading={detailQuery.isPending && Boolean(selectedFeedbackId)}
        />
      </div>
    </PageLayout>
  );
};

function FeedbackInboxList({
  errorMessage,
  feedback,
  isLoading,
  onSelectFeedback,
  selectedFeedbackId,
}: {
  errorMessage: string | undefined;
  feedback: FeedbackListItem[];
  isLoading: boolean;
  onSelectFeedback: (id: UUID | null) => void;
  selectedFeedbackId: UUID | null;
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([{ desc: true, id: 'createdAt' }]);

  const columns = useMemo<ColumnDef<FeedbackListItem>[]>(
    () => [
      {
        accessorFn: (item) => `${item.submitter.name} ${item.submitter.email}`,
        cell: ({ row }) => (
          <UserLabel name={row.original.submitter.name} thumbnailDataUrl={row.original.submitter.thumbnailDataUrl} />
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Submitter',
        id: 'submitter',
      },
      {
        accessorFn: (item) => item.subject.label,
        cell: ({ row }) => <span className="block truncate font-medium">{row.original.subject.label}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Linked to',
        id: 'subject',
        meta: {
          cellClassName: 'max-w-72',
        },
      },
      {
        accessorFn: (item) => feedbackKindLabels[item.kind],
        cell: ({ row }) => feedbackKindLabels[row.original.kind],
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Kind',
        id: 'kind',
      },
      {
        accessorKey: 'status',
        cell: ({ row }) => <FeedbackStatusBadge status={row.original.status} />,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: feedbackStatusFilter,
        header: 'Status',
        meta: {
          filterOptions: Object.entries(feedbackStatusLabels).map(([value, label]) => ({ label, value })),
          filterVariant: 'select',
        },
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} />,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Submitted',
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: feedback,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: feedbackGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      sorting,
    },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const firstFilteredFeedbackId = filteredRows[0]?.original.id ?? null;
  const selectedFeedbackIsVisible = selectedFeedbackId
    ? filteredRows.some((row) => row.original.id === selectedFeedbackId)
    : false;
  const total = filteredRows.length;

  useEffect(() => {
    if (!selectedFeedbackIsVisible) {
      onSelectFeedback(firstFilteredFeedbackId);
    }
  }, [firstFilteredFeedbackId, onSelectFeedback, selectedFeedbackIsVisible]);

  return (
    <section className="min-w-0">
      <DataTable
        emptyMessage="No feedback found."
        errorMessage={errorMessage}
        getRowAriaLabel={(item) => `Review ${item.subject.label}`}
        getRowClassName={(item) => (item.id === selectedFeedbackId ? 'bg-muted/70 hover:bg-muted/70' : undefined)}
        globalFilterPlaceholder="Search feedback..."
        isLoading={isLoading}
        onRowClick={(item) => onSelectFeedback(item.id)}
        table={table}
        total={total}
        totalLabel={(value) => `${value} ${value === 1 ? 'feedback item' : 'feedback items'}`}
      />
    </section>
  );
}

function feedbackGlobalFilter(row: { original: FeedbackListItem }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [
    row.original.subject.label,
    row.original.submitter.name,
    row.original.submitter.email,
    feedbackKindLabels[row.original.kind],
    row.original.kind,
    feedbackStatusLabels[row.original.status],
    row.original.status,
  ].some((value) => value.toLowerCase().includes(search));
}

function feedbackStatusFilter(row: { original: FeedbackListItem }, _columnId: string, filterValue: unknown) {
  return typeof filterValue !== 'string' || !filterValue || row.original.status === filterValue;
}

function normalizeFilterValue(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function FeedbackDetailPanel({
  detail,
  errorMessage,
  isLoading,
}: {
  detail: FeedbackDetail | null;
  errorMessage: string | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Loading detail...</CardContent>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-destructive">{errorMessage}</CardContent>
      </Card>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">Select feedback to review.</CardContent>
      </Card>
    );
  }

  return <FeedbackDetailForm key={detail.id} detail={detail} />;
}

function FeedbackDetailForm({ detail }: { detail: FeedbackDetail }) {
  const trpc = useTRPC();
  const { invalidateFeedback } = useQueryInvalidation();
  const updateMutation = useMutation(trpc.feedback.update.mutationOptions());
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toFeedbackTriageFormValues(detail),
    failureMessage: 'Unable to update feedback.',
    onSaved: () => invalidateFeedback(),
    save: (input: FeedbackUpdateInput) => updateMutation.mutateAsync(input),
    toInput: (values) => toFeedbackUpdateInput(detail.id, values),
    validator: FeedbackTriageFormValues,
  });

  return (
    <form.AppForm>
      <form {...formProps} className="contents">
        <Card className="min-w-0">
          <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-3">
            <CardTitle className="truncate">Feedback: {feedbackKindLabels[detail.kind]}</CardTitle>
            <form.AppField name="status">
              {(field) => (
                <Select
                  disabled={autosave.state.status === 'saving'}
                  value={field.state.value}
                  onValueChange={(status) => {
                    field.handleChange(status as FeedbackStatus);
                    autosave.commit();
                  }}
                >
                  <SelectTrigger
                    aria-label="Feedback status"
                    className={cn(
                      detailHeaderBadgeClassName,
                      'min-w-24 justify-center gap-2 [&_svg]:text-current',
                      feedbackStatusBadgeClassNames[field.state.value],
                    )}
                    size="sm"
                  >
                    <SelectValue>{feedbackStatusLabels[field.state.value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </form.AppField>
          </CardHeader>
          <CardSeparator />
          <CardContent className="grid gap-5">
            <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
            <DetailField label="Submitted by">
              <UserLabel name={detail.submitter.name} thumbnailDataUrl={detail.submitter.thumbnailDataUrl} />
            </DetailField>
            <DetailField label="Linked to">
              <SubjectLink item={detail} />
            </DetailField>
            <DetailField label="Submitted">
              <DateDisplay date={detail.createdAt} format="medium" />
            </DetailField>
            <FeedbackTargets detail={detail} />
            <DetailField label="Feedback">
              <p className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-6">{detail.text}</p>
            </DetailField>
            <DetailField label="Internal notes">
              <form.AppField name="internalNotes">
                {(field) => (
                  <field.TextareaField
                    className="min-h-28 resize-y text-sm"
                    placeholder="Add internal triage notes..."
                  />
                )}
              </form.AppField>
            </DetailField>
          </CardContent>
        </Card>
      </form>
    </form.AppForm>
  );
}

function toFeedbackTriageFormValues(detail: FeedbackDetail): FeedbackTriageFormValues {
  return {
    internalNotes: detail.internalNotes ?? '',
    status: detail.status,
  };
}

function toFeedbackUpdateInput(id: UUID, values: FeedbackTriageFormValues): FeedbackUpdateInput {
  return {
    id,
    internalNotes: values.internalNotes,
    status: values.status,
  };
}

function FeedbackTargets({ detail }: { detail: FeedbackDetail }) {
  if (detail.departments.length === 0 && detail.users.length === 0) {
    return (
      <DetailField label="Targets">
        <span className="text-muted-foreground">None</span>
      </DetailField>
    );
  }

  return (
    <DetailField label="Targets">
      <div className="flex min-w-0 flex-col gap-1">
        {detail.departments.map((department) => (
          <span key={department}>{departmentLabels[department]}</span>
        ))}
        {detail.users.map((user) => (
          <UserLabel key={user.id} name={user.name} thumbnailDataUrl={user.thumbnailDataUrl} />
        ))}
      </div>
    </DetailField>
  );
}

function DetailField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}

function UserLabel({ name, thumbnailDataUrl }: { name: string; thumbnailDataUrl: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2 font-medium">
      <EntityThumbnail label={name} size="sm" thumbnailDataUrl={thumbnailDataUrl} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function SubjectLink({ item }: { item: FeedbackListItem }) {
  const to = item.subject.subjectType === 'quote' ? '/quotes/$id/edit' : '/jobs/$id';

  return (
    <Link
      className="block truncate font-medium hover:underline"
      params={{ id: item.subject.id }}
      to={to}
      onClick={(event) => event.stopPropagation()}
    >
      {item.subject.label}
    </Link>
  );
}

function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <Badge className={feedbackStatusBadgeClassNames[status]} variant="outline">
      {feedbackStatusLabels[status]}
    </Badge>
  );
}
