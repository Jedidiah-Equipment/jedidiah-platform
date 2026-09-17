export function attentionParent({ from, jobId }: { from?: string; jobId?: string }) {
  if (from === 'job' && jobId) return { label: 'Job', href: `/contracting/jobs/${jobId}` } as const;
  if (from === 'jobs') return { label: 'Jobs', href: '/contracting/jobs' } as const;
  return { label: 'Machines', href: '/contracting/machines' } as const;
}
