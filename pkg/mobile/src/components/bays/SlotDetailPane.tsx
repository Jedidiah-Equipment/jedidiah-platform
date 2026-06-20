import { formatBytes, formatDate, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDocument } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';
import type { BaySlotDetail } from '@/lib/use-bay-schedule';

/**
 * The read-only Job Slot detail pane (#520): status chip(s), a product card, the
 * DOCUMENTS list (the viewer it opens lands in #521), and the SLOT and JOB field
 * grids. Slot + Job fields ride the schedule join via {@link BaySlotDetail};
 * documents are fetched here with `jobs.get`, with their own loading/error state.
 */
export function SlotDetailPane({ slot }: { slot: BaySlotDetail }) {
  const isActive = slot.status === 'in-progress';

  return (
    <View className="gap-4">
      {/* Status chip(s): IN PROGRESS / SCHEDULED, plus 'N DAYS LEFT' while running. */}
      <View className="flex-row items-center gap-2">
        <View
          className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
            isActive
              ? 'border-status-in-progress/30 bg-status-in-progress/10'
              : 'border-status-scheduled/30 bg-status-scheduled/10'
          }`}
        >
          <View className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-status-in-progress' : 'bg-status-scheduled'}`} />
          <Text
            className={`text-[10px] tracking-wide ${isActive ? 'text-status-in-progress' : 'text-status-scheduled'}`}
            weight="semibold"
          >
            {isActive ? 'IN PROGRESS' : 'SCHEDULED'}
          </Text>
        </View>
        {slot.remainingWorkDays !== null ? (
          <View className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
            <Text className="text-[10px] tracking-wide text-primary" weight="semibold">
              {slot.remainingWorkDays} DAYS LEFT
            </Text>
          </View>
        ) : null}
      </View>

      {/* Product card. */}
      <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
        <Avatar className="h-[52px] w-[52px] rounded-xl" name={slot.productName} uri={slot.productThumbnailDataUrl} />
        <View className="min-w-0 flex-1">
          <Text className="text-base text-surface-foreground" weight="bold" numberOfLines={1}>
            {slot.productName}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">{slot.productSerialNumber}</Text>
          {slot.customerCompanyName ? (
            <Text className="mt-1 text-sm text-surface-foreground" numberOfLines={1}>
              {slot.customerCompanyName}
            </Text>
          ) : null}
        </View>
      </View>

      {/* DOCUMENTS — opens the in-app viewer (#521); read-only here. */}
      <Documents jobId={slot.jobId} />

      {/* SLOT grid. */}
      <Card title="SLOT">
        <Grid>
          <Row>
            <Field label="SLOT START" value={formatDate(slot.startDate, 'd MMM yyyy')} />
            <Field label="SLOT END" value={formatDate(slot.lastWorkDay, 'd MMM yyyy')} />
          </Row>
          <Row>
            <Field label="WORK DAYS" value={`${slot.workDays} ${slot.workDays === 1 ? 'day' : 'days'}`} />
            <Field label="BAY" value={slot.bayName} />
          </Row>
        </Grid>
      </Card>

      {/* JOB grid. */}
      <Card title="JOB">
        <Grid>
          <Row>
            <Field label="JOB CODE" value={slot.jobCode} />
            <Field label="QUOTE CODE" value={slot.quoteCode} />
          </Row>
          <Row>
            <Field label="PRODUCT" value={slot.productName} />
            <Field label="PRODUCT SERIAL" value={slot.productSerialNumber} />
          </Row>
          <Field label="CUSTOMER" value={slot.customerCompanyName ?? '—'} />
        </Grid>
      </Card>
    </View>
  );
}

function Documents({ jobId }: { jobId: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const documents = query.data?.documents ?? [];

  return (
    <Card title={query.isSuccess ? `DOCUMENTS · ${documents.length}` : 'DOCUMENTS'}>
      {query.isPending ? (
        <Text className="py-2 text-sm text-muted-foreground">Loading documents…</Text>
      ) : query.isError ? (
        <Text className="py-2 text-sm text-danger">Couldn’t load documents.</Text>
      ) : documents.length === 0 ? (
        <Text className="py-2 text-sm text-muted-foreground">No documents for this job.</Text>
      ) : (
        documents.map((document) => <DocumentRow document={document} key={document.id} />)
      )}
    </Card>
  );
}

function DocumentRow({ document }: { document: JobDocument }) {
  const meta = `${PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]} · ${formatBytes(document.byteSize)}`;

  return (
    <View className="flex-row items-center gap-3 border-t border-border py-3">
      <View className="h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
        <Text className="text-base text-primary" weight="bold">
          ⤓
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" weight="semibold" numberOfLines={1}>
          {document.filename}
        </Text>
        <Text className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{meta}</Text>
      </View>
      <Text className="text-base text-muted-foreground">›</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <View className="gap-4">{children}</View>;
}

// A two-column row of fields; RN has no CSS grid, so equal-width flex cells stand in.
function Row({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-4">{children}</View>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="text-sm text-surface-foreground" weight="semibold">
        {value}
      </Text>
    </View>
  );
}
