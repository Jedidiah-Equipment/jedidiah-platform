import { departmentLabels, formatDate } from '@pkg/domain';
import type { Department } from '@pkg/schema';
import { IconArrowsSort } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  type ListControlOption,
  ListControlRow,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { Text } from '@/components/ui/text';
import { CatalogListCard } from '@/equipment/components/CatalogList';
import { DepartmentIcon } from '@/equipment/components/departments/DepartmentIcon';
import { StockBadge } from '@/equipment/components/StockBadge';
import { stripOperatorSuffix } from '@/equipment/lib/bay-name';
import type { BaySort } from '@/equipment/lib/bay-sort';
import type { BayListCard } from '@/equipment/lib/use-bay-list';

const SORT_OPTIONS: readonly ListControlOption<BaySort>[] = [
  { label: 'Days left', value: 'days-left' },
  { label: 'Bay name', value: 'name' },
];

export function PlanCatalogControls({
  onSearchChange,
  onSortChange,
  search,
  sort,
}: {
  onSearchChange: (search: string) => void;
  onSortChange: (sort: BaySort) => void;
  search: string;
  sort: BaySort;
}) {
  return (
    <ListControlRow
      leading={
        <ListSearchControl
          accessibilityLabel="Search Plan"
          onChangeText={onSearchChange}
          placeholder="Search by bay, operator, job, product, or customer…"
          value={search}
        />
      }
      trailing={
        <ListDropdownControl
          accessibilityLabel="Sort bays"
          defaultValue="days-left"
          dismissLabel="Dismiss Bay sort"
          icon={IconArrowsSort}
          onChange={onSortChange}
          options={SORT_OPTIONS}
          value={sort}
        />
      }
    />
  );
}

/** The Department heading the Bays below belong to, the grouping the web Board's Gantt sidebar reads. */
export function PlanDepartmentHeader({ department }: { department: Department }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <DepartmentIcon className="text-muted-foreground" department={department} size={14} />
      <Text className="text-[11px] uppercase tracking-widest text-muted-foreground" mono weight="semibold">
        {departmentLabels[department]}
      </Text>
    </View>
  );
}

export function PlanCatalogCard({ bay }: { bay: BayListCard }) {
  const router = useRouter();
  const operatorName = bay.operator?.name ?? 'Unassigned';
  const bayName = stripOperatorSuffix({ bayName: bay.name, operatorName: bay.operator?.name ?? null });
  const title = `${operatorName} - ${bayName}`;
  const activeSummary = bay.active?.customerCompanyName
    ? `${bay.active.jobDisplayName} · ${bay.active.customerCompanyName}`
    : undefined;

  return (
    <CatalogListCard
      accessibilityHint="Opens Bay schedule"
      accessibilityLabel={`Bay ${bay.name}`}
      avatarName={operatorName}
      avatarUri={bay.operator?.thumbnailDataUrl}
      mainText={title}
      metadata={
        bay.active && bay.active.customerCompanyName === null ? (
          <>
            <Text className="text-[10px] text-muted-foreground" mono numberOfLines={1}>
              {bay.active.jobDisplayName} ·
            </Text>
            <StockBadge size="compact" />
          </>
        ) : undefined
      }
      monoText={activeSummary}
      onPress={() => router.push({ pathname: '/equipment/bays/[bayId]', params: { bayId: bay.id } })}
      subText={bay.active?.jobCode ?? 'NO ACTIVE JOB'}
      trailing={<PlanScheduleSummary bay={bay} />}
    />
  );
}

function PlanScheduleSummary({ bay }: { bay: BayListCard }) {
  if (!bay.active) {
    return (
      <Text className="text-[10px] tracking-wide text-muted-foreground" weight="bold">
        IDLE
      </Text>
    );
  }

  return (
    <View className="items-end gap-0.5">
      <Text className="text-[10px] tracking-wide text-primary" mono numberOfLines={1} weight="bold">
        {bay.active.remainingWorkDays} {bay.active.remainingWorkDays === 1 ? 'DAY' : 'DAYS'} LEFT
      </Text>
      <Text className="text-[9px] text-muted-foreground" mono numberOfLines={1}>
        {formatDate(bay.active.lastWorkDay, 'd MMM yyyy')}
      </Text>
    </View>
  );
}
