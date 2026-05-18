import type React from 'react';

type JobFactProps = {
  label: string;
  value: React.ReactNode;
};

export const JobFact: React.FC<JobFactProps> = ({ label, value }) => (
  <div className="min-w-0 rounded-md border bg-muted/20 p-3">
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <div className="truncate text-sm">{value}</div>
  </div>
);
