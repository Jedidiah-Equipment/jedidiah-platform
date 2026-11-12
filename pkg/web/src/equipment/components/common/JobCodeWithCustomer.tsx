import type React from 'react';

type LinkedJob = { code: string; customerCompanyName: string | null };

/** A linked Job named with whose it is: its Customer, or Stock when we hold the machine. */
export function jobCodeWithCustomerText(job: LinkedJob): string {
  return `${job.code} · ${job.customerCompanyName ?? 'Stock'}`;
}

export const JobCodeWithCustomer: React.FC<{ job: LinkedJob }> = ({ job }) => (
  <span className="min-w-0 truncate" title={jobCodeWithCustomerText(job)}>
    <span className="font-mono">{job.code}</span>
    {` · ${job.customerCompanyName ?? 'Stock'}`}
  </span>
);
