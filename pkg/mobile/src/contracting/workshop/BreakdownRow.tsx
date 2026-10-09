import { breakdownSubjectKindLabels, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import type { BreakdownSummary } from '@pkg/schema/contracting';
import { router } from 'expo-router';
import { CatalogListCard } from '@/components/CatalogList';
import { DateText } from '@/components/DateText';
import { Text } from '@/components/ui/text';
import { BreakdownStatusBadge } from '@/contracting/components/BreakdownSubjectIcons';
import { urgencyTileProps } from '@/contracting/components/list-tiles';

/** One Breakdown in a list, opening its detail: the Workshop tab's rows and a Machine's open Breakdowns. */
export function BreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const { subject } = breakdown;
  const tile = urgencyTileProps(breakdown.urgency);
  return (
    <CatalogListCard
      accessibilityHint="Opens the Breakdown"
      accessibilityLabel={`${breakdownUrgencyLabels[breakdown.urgency]} on ${breakdownSubjectKindLabels[subject.kind]} ${subject.code}`}
      avatarClassName={tile.className}
      avatarFallback={tile.fallback}
      avatarName={subject.code}
      mainText={subject.code}
      metadata={
        <>
          <DateText
            className="shrink-0 text-[10px] text-muted-foreground"
            date={breakdown.reportedAt}
            format="medium"
            mono
          />
          <Text className="min-w-0 flex-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
            {` · ${[breakdown.reporterName, breakdown.mechanicName].filter(Boolean).join(' · ')}`}
          </Text>
        </>
      }
      onPress={() =>
        router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: breakdown.id } })
      }
      subText={breakdown.firstLine}
      trailing={<BreakdownStatusBadge status={breakdown.status} />}
    />
  );
}
