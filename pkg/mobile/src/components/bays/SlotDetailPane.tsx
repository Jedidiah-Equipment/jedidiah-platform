import { formatBytes, formatDate, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDocument } from '@pkg/schema';
import { IconChevronRight, IconDownload } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';
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
      {/* Status chip(s): IN PROGRESS / SCHEDULED, plus 'N DAYS LEFT' while running. The
          SCHEDULED chip matches its timeline card — green for the 'next' Slot, grey otherwise. */}
      <View className="flex-row items-center gap-2">
        <View
          className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
            isActive
              ? 'border-status-in-progress/30 bg-status-in-progress/10'
              : slot.isNext
                ? 'border-status-next/30 bg-status-next/10'
                : 'border-muted-foreground/30 bg-muted-foreground/10'
          }`}
        >
          <View
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? 'bg-status-in-progress' : slot.isNext ? 'bg-status-next' : 'bg-muted-foreground'
            }`}
          />
          <Text
            className={`text-[10px] tracking-wide ${
              isActive ? 'text-status-in-progress' : slot.isNext ? 'text-status-next' : 'text-muted-foreground'
            }`}
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
          <Text className="mt-0.5 text-xs text-muted-foreground" mono>
            {slot.productSerialNumber}
          </Text>
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
            <Field label="JOB CODE" mono value={slot.jobCode} />
            <Field label="QUOTE CODE" mono value={slot.quoteCode} />
          </Row>
          <Row>
            <Field label="PRODUCT" value={slot.productName} />
            <Field label="PRODUCT SERIAL" mono value={slot.productSerialNumber} />
          </Row>
          <Field label="CUSTOMER" value={slot.customerCompanyName ?? '—'} />
        </Grid>
      </Card>
    </View>
  );
}

function Documents({ jobId }: { jobId: string }) {
  const router = useRouter();
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
        documents.map((document) => (
          <DocumentRow
            document={document}
            key={document.id}
            onOpen={() =>
              router.push({ pathname: '/documents/[documentId]', params: { documentId: document.id, jobId } })
            }
          />
        ))
      )}
    </Card>
  );
}

function DocumentRow({ document, onOpen }: { document: JobDocument; onOpen: () => void }) {
  const meta = `${PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]} · ${formatBytes(document.byteSize)}`;

  return (
    <Pressable
      accessibilityHint="Opens the document viewer"
      accessibilityRole="button"
      className="flex-row items-center gap-3 border-t border-border py-3 active:opacity-70"
      onPress={onOpen}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
        <Icon className="text-primary" icon={IconDownload} size={18} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" weight="semibold" numberOfLines={1}>
          {document.filename}
        </Text>
        <Text className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{meta}</Text>
      </View>
      <Icon className="text-muted-foreground" icon={IconChevronRight} size={18} />
    </Pressable>
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

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="text-sm text-surface-foreground" mono={mono} weight="semibold">
        {value}
      </Text>
    </View>
  );
}
