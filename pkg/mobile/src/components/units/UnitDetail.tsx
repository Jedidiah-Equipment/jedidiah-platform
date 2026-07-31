import { formatDate } from '@pkg/domain';
import type { ProductUnitDetail, ProductUnitJob, ProductUnitOwnershipTransfer } from '@pkg/schema';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { UnitBuildStateChip } from '@/components/units/UnitBuildStateChip';
import { useCan } from '@/lib/use-access';

/** Read-only Product Unit screen. Mirrors the web Unit page; the VIN is shown, never edited. */
export function UnitDetail({ unit, onBack }: { unit: ProductUnitDetail; onBack: () => void }) {
  return (
    <View className="flex-1 bg-background">
      <UnitDetailHeader onBack={onBack} unit={unit} />
      <ScrollView contentContainerClassName="mx-auto w-full max-w-[720px] gap-4 px-4 pb-8 pt-4">
        <UnitIdentity unit={unit} />
        <UnitFactsCard unit={unit} />
        <UnitAssembliesCard unit={unit} />
        <UnitOwnershipCard unit={unit} />
        <UnitJobsCard unit={unit} />
      </ScrollView>
    </View>
  );
}

function UnitDetailHeader({ unit, onBack }: { unit: ProductUnitDetail; onBack: () => void }) {
  return (
    <View className="border-b border-border bg-background">
      <View className="mx-auto h-16 w-full max-w-[720px] flex-row items-center gap-2 px-4">
        <Pressable
          accessibilityLabel="Back to Units"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
          onPress={onBack}
        >
          <Icon icon={IconChevronLeft} size={20} />
        </Pressable>
        <Avatar
          className="h-10 w-10 rounded-xl"
          name={unit.product.name}
          textClassName="text-[10px]"
          uri={unit.product.thumbnailDataUrl}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-[17px] leading-5 text-foreground" mono numberOfLines={1} weight="bold">
            {unit.productSerialNumber}
          </Text>
          <Text className="mt-0.5 text-[11px] text-muted-foreground" numberOfLines={1}>
            {unit.product.name}
          </Text>
        </View>
        <ProfileMenuButton />
      </View>
    </View>
  );
}

function UnitIdentity({ unit }: { unit: ProductUnitDetail }) {
  return (
    <View className="flex-row items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5">
      <Avatar
        className="h-16 w-16 rounded-xl"
        name={unit.product.name}
        textClassName="text-sm"
        uri={unit.product.thumbnailDataUrl}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-lg leading-6 text-surface-foreground" numberOfLines={2} weight="bold">
          {unit.product.name}
        </Text>
        <Text className="mt-1 text-[11px] text-muted-foreground" mono numberOfLines={1}>
          {unit.product.modelCode}
        </Text>
      </View>
      <UnitBuildStateChip buildState={unit.buildState} owner={unit.owner} />
    </View>
  );
}

function UnitFactsCard({ unit }: { unit: ProductUnitDetail }) {
  return (
    <SectionCard title="UNIT">
      <View className="flex-row flex-wrap gap-x-4 gap-y-4">
        <DetailFact label="SERIAL" mono value={unit.productSerialNumber} />
        {/* The serial is minted with the Unit and the Product is a fact about the build, so on mobile
            the VIN is read-only too: every identity field here is a record, not an input. */}
        <DetailFact label="VIN" mono value={unit.vinNumber ?? '—'} />
        <DetailFact label="OWNER" value={unit.owner?.companyName ?? 'Stock'} />
        <DetailFact label="CREATED" value={formatDate(unit.createdAt, 'd MMM yyyy')} />
      </View>
    </SectionCard>
  );
}

function UnitAssembliesCard({ unit }: { unit: ProductUnitDetail }) {
  return (
    <SectionCard title={`FITTED ASSEMBLIES · ${unit.asBuiltSpec.length}`}>
      {unit.asBuiltSpec.length === 0 ? (
        <Text className="text-sm text-muted-foreground">No optional assemblies are fitted to this unit.</Text>
      ) : (
        unit.asBuiltSpec.map((assembly) => (
          <View className="flex-row items-center gap-3 border-t border-border py-3" key={assembly.id}>
            <View className="h-2 w-2 rounded-full bg-primary" />
            <Text className="min-w-0 flex-1 text-sm text-surface-foreground" weight="semibold">
              {assembly.name}
            </Text>
          </View>
        ))
      )}
    </SectionCard>
  );
}

function UnitOwnershipCard({ unit }: { unit: ProductUnitDetail }) {
  return (
    <SectionCard title={`OWNERSHIP HISTORY · ${unit.ownershipHistory.length}`}>
      {unit.ownershipHistory.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          This unit has never changed hands — we have held it since it was built.
        </Text>
      ) : (
        unit.ownershipHistory.map((transfer) => <OwnershipTransferRow key={transfer.id} transfer={transfer} />)
      )}
    </SectionCard>
  );
}

function OwnershipTransferRow({ transfer }: { transfer: ProductUnitOwnershipTransfer }) {
  return (
    <View className="gap-1 border-t border-border py-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm text-surface-foreground" mono weight="semibold">
          {formatDate(transfer.occurredOn, 'd MMM yyyy')}
        </Text>
        {/* A null Customer on either side is us: the machine came from, or returned to, Stock. */}
        <Text className="min-w-0 flex-1 text-sm text-muted-foreground" numberOfLines={1}>
          {transfer.fromCustomer?.companyName ?? 'Stock'} → {transfer.toCustomer?.companyName ?? 'Stock'}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-x-3">
        {/* A null actor is the system: the backfill, not a person. */}
        <Text className="text-[10px] text-muted-foreground" mono>
          Recorded by {transfer.actor?.name ?? 'the system'}
        </Text>
        {transfer.sourceQuote ? (
          <Text className="text-[10px] text-muted-foreground" mono>
            Quote {transfer.sourceQuote.code}
          </Text>
        ) : null}
      </View>
      {transfer.note ? <Text className="text-[11px] leading-5 text-muted-foreground">{transfer.note}</Text> : null}
    </View>
  );
}

function UnitJobsCard({ unit }: { unit: ProductUnitDetail }) {
  const canReadJobs = useCan('job:read').can;

  return (
    <SectionCard title={`JOBS · ${unit.jobs.length}`}>
      {unit.jobs.length === 0 ? (
        <Text className="text-sm text-muted-foreground">No Job is bound to this unit.</Text>
      ) : (
        unit.jobs.map((job) => <UnitJobRow canOpen={canReadJobs} job={job} key={job.id} />)
      )}
    </SectionCard>
  );
}

function UnitJobRow({ canOpen, job }: { canOpen: boolean; job: ProductUnitJob }) {
  const router = useRouter();
  const status = job.completedOn ? `Completed ${formatDate(job.completedOn, 'd MMM yyyy')}` : 'In progress';
  const details = (
    <>
      <Text className="text-sm text-surface-foreground" mono numberOfLines={1} weight="semibold">
        {job.code}
      </Text>
      <Text className="mt-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
        {job.cancelledAt ? `Cancelled · ${status}` : status}
      </Text>
    </>
  );

  if (!canOpen) {
    return (
      <View className="border-t border-border py-3">
        <View className="min-w-0 flex-1">{details}</View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2 border-t border-border py-3">
      <Pressable
        accessibilityHint="Opens the Job"
        accessibilityLabel={`Job ${job.code}`}
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-2 active:opacity-70"
        onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.id } })}
      >
        <View className="min-w-0 flex-1">{details}</View>
        <Icon className="text-muted-foreground" icon={IconChevronRight} size={16} />
      </Pressable>
    </View>
  );
}

function DetailFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="min-w-[140px] flex-1 basis-[45%]">
      <FactLabel>{label}</FactLabel>
      <Text className="mt-1 text-sm text-surface-foreground" mono={mono} weight="semibold">
        {value}
      </Text>
    </View>
  );
}

function FactLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[10px] uppercase tracking-wide text-muted-foreground" mono>
      {children}
    </Text>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground" mono weight="semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}
