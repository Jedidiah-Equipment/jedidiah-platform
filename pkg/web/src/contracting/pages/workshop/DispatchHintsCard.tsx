import type { BreakdownDetail } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { BreakdownStatusBadge, BreakdownSubjectLabel } from '@/contracting/components/BreakdownSubjectLabel.js';

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
          {breakdown.dispatchHints.map((hint) => (
            <li key={hint.breakdownId}>
              <Link
                className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted"
                params={{ id: hint.breakdownId }}
                to="/contracting/workshop/$id"
              >
                <BreakdownSubjectLabel
                  className="flex-1"
                  urgency={hint.urgency}
                  subject={hint.subject}
                  name={
                    <>
                      <span className="shrink-0 font-mono font-semibold">{hint.subject.code}</span>
                      <span className="truncate text-sm text-muted-foreground">{hint.firstLine}</span>
                    </>
                  }
                />
                <BreakdownStatusBadge status={hint.status} />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
