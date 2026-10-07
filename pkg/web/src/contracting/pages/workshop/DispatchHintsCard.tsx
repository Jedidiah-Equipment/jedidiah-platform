import { breakdownUrgencyColorClassNames, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import type { BreakdownDetail } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { cn } from '@/lib/utils.js';

/** The other open Breakdowns on the same Job, so one trip can fix several. */
export function DispatchHintsCard({ breakdown }: { breakdown: BreakdownDetail }) {
  if (!breakdown.dispatchHints.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Also open on this Job</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {breakdown.dispatchHints.map((hint) => {
            const colours = breakdownUrgencyColorClassNames[hint.urgency];
            return (
              <li key={hint.breakdownId}>
                <Link
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted"
                  params={{ id: hint.breakdownId }}
                  to="/contracting/workshop/$id"
                >
                  <CategoryLabel
                    icon={hint.subject.categoryIcon}
                    colour={hint.subject.categoryColour}
                    name={<span className="font-mono font-semibold">{hint.subject.code}</span>}
                  />
                  <Badge className={cn(colours.chip, colours.text)} variant="outline">
                    {breakdownUrgencyLabels[hint.urgency]}
                  </Badge>
                  <span className="truncate text-sm text-muted-foreground">{hint.firstLine}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
