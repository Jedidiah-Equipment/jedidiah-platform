import { departmentLabels } from '@pkg/domain';
import type { FeedbackDetail, FeedbackKind, FeedbackListItem, FeedbackStatus, UUID } from '@pkg/schema';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { feedbackPageDescription } from '@/utils/page-descriptions.js';

type FeedbackStatusFilter = FeedbackStatus | 'all';

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

export const FeedbackPage: React.FC = () => {
  const trpc = useTRPC();
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>('all');
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<UUID | null>(null);

  const listInput = useMemo(() => (statusFilter === 'all' ? {} : { status: statusFilter }), [statusFilter]);
  const feedbackQuery = useQuery(
    trpc.feedback.list.queryOptions(listInput, {
      placeholderData: keepPreviousData,
    }),
  );
  const feedbackItems = feedbackQuery.data?.items ?? [];

  useEffect(() => {
    if (feedbackItems.length === 0) {
      setSelectedFeedbackId(null);
      return;
    }

    if (!selectedFeedbackId || !feedbackItems.some((item) => item.id === selectedFeedbackId)) {
      setSelectedFeedbackId(feedbackItems[0]?.id ?? null);
    }
  }, [feedbackItems, selectedFeedbackId]);

  const detailQuery = useQuery(
    trpc.feedback.get.queryOptions(
      { id: selectedFeedbackId ?? feedbackItems[0]?.id ?? '00000000-0000-4000-8000-000000000000' },
      { enabled: Boolean(selectedFeedbackId) },
    ),
  );

  return (
    <PageLayout
      actions={<FeedbackStatusSelect value={statusFilter} onChange={setStatusFilter} />}
      description={feedbackPageDescription}
      size="lg"
      title="Feedback"
    >
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

function FeedbackStatusSelect({
  onChange,
  value,
}: {
  onChange: (value: FeedbackStatusFilter) => void;
  value: FeedbackStatusFilter;
}) {
  return (
    <Select onValueChange={(nextValue) => onChange(nextValue as FeedbackStatusFilter)} value={value}>
      <SelectTrigger aria-label="Feedback status" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(feedbackStatusLabels).map(([status, label]) => (
            <SelectItem key={status} value={status}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

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
  onSelectFeedback: (id: UUID) => void;
  selectedFeedbackId: UUID | null;
}) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">Inbox</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Submitter</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                  Loading feedback...
                </TableCell>
              </TableRow>
            ) : null}
            {errorMessage ? (
              <TableRow>
                <TableCell className="h-24 text-center text-destructive" colSpan={5}>
                  {errorMessage}
                </TableCell>
              </TableRow>
            ) : null}
            {!isLoading && !errorMessage && feedback.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                  No feedback found.
                </TableCell>
              </TableRow>
            ) : null}
            {!isLoading && !errorMessage
              ? feedback.map((item) => (
                  <TableRow
                    className={cn('cursor-pointer', item.id === selectedFeedbackId && 'bg-muted/70 hover:bg-muted/70')}
                    key={item.id}
                    onClick={() => onSelectFeedback(item.id)}
                  >
                    <TableCell className="max-w-72">
                      <SubjectLink item={item} />
                    </TableCell>
                    <TableCell>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{item.submitter.name}</span>
                        <span className="truncate text-muted-foreground text-xs">{item.submitter.email}</span>
                      </span>
                    </TableCell>
                    <TableCell>{feedbackKindLabels[item.kind]}</TableCell>
                    <TableCell>
                      <FeedbackStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={item.createdAt} />
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
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

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FeedbackStatusBadge status={detail.status} />
          <Badge variant="outline">{feedbackKindLabels[detail.kind]}</Badge>
        </div>
        <CardTitle className="text-lg">
          <SubjectLink item={detail} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <DetailField label="Submitted by">
          <span className="font-medium">{detail.submitter.name}</span>
          <span className="text-muted-foreground">{detail.submitter.email}</span>
        </DetailField>
        <DetailField label="Submitted">
          <DateDisplay date={detail.createdAt} format="medium" />
        </DetailField>
        <DetailField label="Feedback">
          <p className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm leading-6">{detail.text}</p>
        </DetailField>
        <FeedbackTargets detail={detail} />
      </CardContent>
    </Card>
  );
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
      <div className="flex flex-wrap gap-2">
        {detail.departments.map((department) => (
          <Badge key={department} variant="secondary">
            {departmentLabels[department]}
          </Badge>
        ))}
        {detail.users.map((user) => (
          <Badge key={user.id} variant="secondary">
            {user.name}
          </Badge>
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
  return <Badge variant={status === 'open' ? 'default' : 'outline'}>{feedbackStatusLabels[status]}</Badge>;
}
