import type { JobDetail } from '@pkg/schema';
import { IconChecklist } from '@tabler/icons-react';

import { Card, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';

export function CustomJobWorkItems({ job }: { job: Pick<JobDetail, 'quoteKind' | 'workRows'> }) {
  if (job.quoteKind !== 'custom') return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconChecklist className="size-4 text-muted-foreground" />
          <span>Work Items</span>
        </CardTitle>
      </CardHeader>
      <CardSeparator />
      <CardContent className="p-0">
        {job.workRows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No Work Items.</p>
        ) : (
          <ul className="divide-y text-sm">
            {job.workRows.map((item) => (
              <li className="px-4 py-3" key={item.id}>
                {item.name}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
