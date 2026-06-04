import type React from 'react';

import { Card, CardContent } from '@/components/ui/card.js';

type JobFactProps = {
  label: string;
  value: React.ReactNode;
};

export const JobFact: React.FC<JobFactProps> = ({ label, value }) => (
  <Card size="sm">
    <CardContent className="grid gap-1">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="truncate text-sm">{value}</div>
    </CardContent>
  </Card>
);
