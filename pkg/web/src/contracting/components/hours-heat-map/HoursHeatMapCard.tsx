import type { HoursHeatMapInput } from '@pkg/schema/contracting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { HoursHeatMap } from './HoursHeatMap.js';

/** The heat map in a Card for a page to place; nothing at all for a role that cannot read reports. */
export function HoursHeatMapCard(input: HoursHeatMapInput) {
  const { can } = useCan('contracting_report:read');
  if (!can) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily hours</CardTitle>
      </CardHeader>
      <CardContent>
        <HoursHeatMap {...input} />
      </CardContent>
    </Card>
  );
}
